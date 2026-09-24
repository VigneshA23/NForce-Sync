package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;
import com.nforceone.sync.ai.contract.ConversationTurn;
import com.nforceone.sync.ai.contract.KnowledgeRetriever;
import com.nforceone.sync.ai.contract.LlmCompletion;
import com.nforceone.sync.ai.contract.LlmProvider;
import com.nforceone.sync.ai.contract.LlmRequest;
import com.nforceone.sync.ai.contract.PageReference;
import com.nforceone.sync.ai.contract.RetrievalQuery;
import com.nforceone.sync.ai.contract.RetrievalResult;
import com.nforceone.sync.ai.contract.RoleLabels;
import com.nforceone.sync.ai.data.AssistantDataService;
import com.nforceone.sync.ai.entity.AiConversation;
import com.nforceone.sync.ai.exception.AiProviderException;
import com.nforceone.sync.ai.exception.AiRateLimitExceededException;
import com.nforceone.sync.ai.navigation.NavigationValidator;
import com.nforceone.sync.ai.observability.AiInteractionLogger;
import com.nforceone.sync.ai.prompt.PromptBuilder;
import com.nforceone.sync.ai.response.ResponseValidator;
import com.nforceone.sync.ai.response.UnknownResponses;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Orchestrates one chat turn end to end. Every failure path returns a controlled
 * {@link AssistantResponse} with HTTP 200 — except {@link AiRateLimitExceededException}, the one
 * deliberate exception, which the controller/advice map to 429.
 *
 * <p><b>Structural read-only guarantee:</b> this class depends on no mutating Sync business
 * service. Its only writes are to {@code ai_*} tables via {@link ConversationService} and
 * {@link AiInteractionLogger}. Live data flows through {@link AssistantDataService}, whose
 * providers (added in a later milestone) call read-only methods only.
 */
@Service
public class AiAssistantService {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantService.class);

    // A message that is ONLY a greeting (no real question attached) never matches a knowledge
    // chunk, so it fell through to notEnoughKnowledge() before this existed — see the "hi good
    // morning" bug report. Deliberately conservative: "hi, how do I submit my EOD" still goes
    // through retrieval as a real question; only a standalone greeting short-circuits here.
    private static final Pattern GREETING_PATTERN = Pattern.compile(
            "^(?:hi|hello|hey|hiya|yo|greetings|good\\s*(?:morning|afternoon|evening|day))"
                    + "(?:[,!.\\s]+(?:hi|hello|hey|there|again|good\\s*(?:morning|afternoon|evening|day)))*[!.\\s]*$",
            Pattern.CASE_INSENSITIVE);

    private final AppUserRepository appUserRepository;
    private final AiProperties properties;
    private final AiRateLimiter rateLimiter;
    private final NavigationValidator navigationValidator;
    private final KnowledgeRetriever retriever;
    private final AssistantDataService dataService;
    private final PromptBuilder promptBuilder;
    private final LlmProvider llmProvider;
    private final ResponseValidator responseValidator;
    private final ConversationService conversationService;
    private final AiInteractionLogger interactionLogger;

    public AiAssistantService(AppUserRepository appUserRepository, AiProperties properties,
            AiRateLimiter rateLimiter, NavigationValidator navigationValidator, KnowledgeRetriever retriever,
            AssistantDataService dataService, PromptBuilder promptBuilder, LlmProvider llmProvider,
            ResponseValidator responseValidator, ConversationService conversationService,
            AiInteractionLogger interactionLogger) {
        this.appUserRepository = appUserRepository;
        this.properties = properties;
        this.rateLimiter = rateLimiter;
        this.navigationValidator = navigationValidator;
        this.retriever = retriever;
        this.dataService = dataService;
        this.promptBuilder = promptBuilder;
        this.llmProvider = llmProvider;
        this.responseValidator = responseValidator;
        this.conversationService = conversationService;
        this.interactionLogger = interactionLogger;
    }

    public AssistantResponse chat(String actorEmail, String message, String conversationId, String currentPageId) {
        // Disabled or unconfigured: no DB work at all (I18 — a disabled assistant must not cost
        // a query on every turn, mirroring /health's fast path).
        if (!properties.isUsable()) {
            return UnknownResponses.disabled();
        }

        Optional<AppUser> userOpt = appUserRepository.findByEmailAndDeletedAtIsNull(actorEmail);
        if (userOpt.isEmpty() || userOpt.get().getStatus() != AppUser.Status.ACTIVE) {
            // Extremely rare (authenticated but no active row) — nothing to log against reliably.
            return UnknownResponses.inactiveUser();
        }
        AppUser user = userOpt.get();

        AssistantRequestContext context = new AssistantRequestContext(
                user.getId(), user.getEmail(), user.getRole(), RoleLabels.label(user.getRole()), null, null);

        String trimmed = message == null ? "" : message.trim();
        int maxMessageChars = properties.getLimits().getMaxMessageChars();

        if (trimmed.isEmpty()) {
            logDecline(context, null, "EMPTY_MESSAGE", trimmed.length());
            return UnknownResponses.emptyMessage();
        }
        if (trimmed.length() > maxMessageChars) {
            logDecline(context, null, "MESSAGE_TOO_LONG", trimmed.length());
            return UnknownResponses.messageTooLong(maxMessageChars);
        }

        try {
            rateLimiter.checkAndRecord(user.getId());
        } catch (AiRateLimitExceededException e) {
            logDecline(context, null, "RATE_LIMITED", trimmed.length());
            throw e;
        }

        Optional<PageReference> currentPage = navigationValidator.validateCurrentPage(currentPageId, context);
        context = context.withCurrentPage(
                currentPage.map(PageReference::pageId).orElse(null),
                currentPage.map(PageReference::module).orElse(null));

        AiConversation conversation = conversationService.resolve(conversationId, user.getId());
        Instant deadline = Instant.now().plusSeconds(properties.getLimits().getTurnDeadlineSeconds());

        // Fetched before retrieval (not just for the prompt) so a short follow-up question can
        // borrow context from the previous turn for embedding purposes — see retrievalText below.
        List<ConversationTurn> history = conversationService.recentTurns(conversation.getId());

        // I20: a short question ("who approves it?") often has too little of its own signal to
        // embed well. Blending in the previous turn's question — never the answer, which could
        // pull the embedding toward unrelated tangents the answer happened to mention — gives it
        // enough context to retrieve correctly, without changing what is shown to the user or
        // sent to the model as the actual question.
        String retrievalText = trimmed;
        if (properties.getRetrieval().isFollowUpContext() && trimmed.length() < 80 && !history.isEmpty()) {
            retrievalText = history.get(history.size() - 1).userMessage() + " " + trimmed;
        }

        if (GREETING_PATTERN.matcher(trimmed).matches()) {
            AssistantResponse greeting = greetingResponse(user.getFullName());
            Long messageId = conversationService.recordTurn(conversation, trimmed, greeting.answer(), greeting.type().name());
            logTurn(context, conversation.getId().toString(), messageId, greeting, List.of(), 0, null,
                    List.of(), null, null, null, null, null, 0, true, null, trimmed.length());
            return greeting.withConversationId(conversation.getId().toString()).withMessageId(messageId);
        }

        List<RetrievalResult> knowledge;
        try {
            RetrievalQuery query = new RetrievalQuery(retrievalText, null, Set.of(context.role().name()),
                    context.currentModule(), context.currentPageId(), 0, 0);
            knowledge = retriever.retrieve(query, deadline);
        } catch (AiProviderException e) {
            log.warn("Retrieval (embedding call) failed: {}", e.getMessage());
            logDecline(context, conversation.getId().toString(), "RETRIEVAL_UNAVAILABLE", trimmed.length());
            return UnknownResponses.retrievalUnavailable().withConversationId(conversation.getId().toString());
        }

        if (knowledge.isEmpty()) {
            AssistantResponse decline = UnknownResponses.notEnoughKnowledge();
            Long messageId = conversationService.recordTurn(conversation, trimmed, decline.answer(), decline.type().name());
            logTurn(context, conversation.getId().toString(), messageId, decline, List.of(), 0, null,
                    List.of(), null, null, null, null, null, 1, false, "NO_KNOWLEDGE", trimmed.length());
            return decline.withConversationId(conversation.getId().toString()).withMessageId(messageId);
        }

        AssistantDataService.Selection liveData = dataService.fetch(context, knowledge, context.currentModule());

        String systemPrompt = promptBuilder.buildSystemPrompt(context, knowledge, currentPage.orElse(null), liveData.sections());
        String userPrompt = promptBuilder.buildUserPrompt(trimmed, history);

        LlmCompletion completion;
        long startedAt = System.currentTimeMillis();
        try {
            completion = llmProvider.complete(new LlmRequest(systemPrompt, userPrompt,
                    properties.getMistral().getMaxTokens(), properties.getMistral().getTemperature(), true), deadline);
        } catch (AiProviderException e) {
            log.warn("Chat completion call failed: {}", e.getMessage());
            logDecline(context, conversation.getId().toString(), "PROVIDER_UNAVAILABLE", trimmed.length());
            return UnknownResponses.providerUnavailable().withConversationId(conversation.getId().toString());
        }
        long latencyMs = System.currentTimeMillis() - startedAt;

        AssistantResponse response = responseValidator.validate(completion.content(), context);

        Long messageId = conversationService.recordTurn(conversation, trimmed, response.answer(), response.type().name());

        List<String> knowledgeIds = knowledge.stream().map(RetrievalResult::knowledgeId).toList();
        Double topScore = knowledge.stream().mapToDouble(RetrievalResult::score).max().stream().boxed().findFirst().orElse(null);
        boolean isUnknown = response.type() == com.nforceone.sync.ai.contract.AssistantResponseType.UNKNOWN;

        logTurn(context, conversation.getId().toString(), messageId, response, knowledgeIds, knowledge.size(), topScore,
                liveData.providerIds(), completion.provider(), completion.model(), completion.promptTokens(),
                completion.completionTokens(), latencyMs, completion.attempts(), true,
                isUnknown ? "UNKNOWN_ANSWER" : null, trimmed.length());

        return response.withConversationId(conversation.getId().toString()).withMessageId(messageId);
    }

    /** Same warm reply for every role — a greeting isn't a Sync question, so nothing role-specific applies. */
    private static AssistantResponse greetingResponse(String fullName) {
        String firstName = fullName == null || fullName.isBlank() ? null : fullName.trim().split("\\s+")[0];
        String greeting = firstName == null || firstName.isBlank()
                ? "Hi! How can I help you today?"
                : "Hi " + firstName + "! How can I help you today?";
        return new AssistantResponse(AssistantResponseType.EXPLANATION, greeting,
                List.of(), null, List.of(), ConfidenceLevel.HIGH, null, null);
    }

    private void logDecline(AssistantRequestContext context, String conversationId, String errorCode, int questionChars) {
        interactionLogger.record(new AiInteractionLogger.Turn(
                conversationId == null ? null : java.util.UUID.fromString(conversationId), null,
                context.userId(), context.role().name(), context.currentPageId(),
                null, null, null, List.of(), 0, null, List.of(),
                null, null, null, null, null, 1, null, false, errorCode, questionChars));
    }

    private void logTurn(AssistantRequestContext context, String conversationId, Long assistantMessageId,
            AssistantResponse response, List<String> knowledgeIds, int retrievedCount, Double topScore,
            List<String> liveDataProviderIds, String provider, String model, Integer promptTokens,
            Integer completionTokens, Long latencyMs, int apiCallAttempts, boolean success, String errorCode,
            int questionChars) {
        interactionLogger.record(new AiInteractionLogger.Turn(
                java.util.UUID.fromString(conversationId), assistantMessageId, context.userId(),
                context.role().name(), context.currentPageId(),
                response.type() == null ? null : response.type().name(),
                response.confidence() == null ? null : response.confidence().name(),
                response.navigation() == null ? null : response.navigation().pageId(),
                knowledgeIds, retrievedCount, topScore, liveDataProviderIds, provider, model,
                promptTokens, completionTokens, null, apiCallAttempts, latencyMs, success, errorCode, questionChars));
    }
}
