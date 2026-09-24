package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;
import com.nforceone.sync.ai.contract.KnowledgeRetriever;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.contract.LlmCompletion;
import com.nforceone.sync.ai.contract.LlmProvider;
import com.nforceone.sync.ai.contract.NavigationAction;
import com.nforceone.sync.ai.contract.RetrievalResult;
import com.nforceone.sync.ai.data.AssistantDataService;
import com.nforceone.sync.ai.entity.AiConversation;
import com.nforceone.sync.ai.exception.AiProviderException;
import com.nforceone.sync.ai.exception.AiRateLimitExceededException;
import com.nforceone.sync.ai.navigation.NavigationValidator;
import com.nforceone.sync.ai.observability.AiInteractionLogger;
import com.nforceone.sync.ai.prompt.PromptBuilder;
import com.nforceone.sync.ai.response.ResponseValidator;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AiAssistantServiceTest {

    private AppUserRepository appUserRepository;
    private AiRateLimiter rateLimiter;
    private NavigationValidator navigationValidator;
    private KnowledgeRetriever retriever;
    private AssistantDataService dataService;
    private PromptBuilder promptBuilder;
    private LlmProvider llmProvider;
    private ResponseValidator responseValidator;
    private ConversationService conversationService;
    private AiInteractionLogger interactionLogger;
    private AiProperties properties;
    private AiAssistantService service;

    @BeforeEach
    void setUp() {
        appUserRepository = mock(AppUserRepository.class);
        rateLimiter = mock(AiRateLimiter.class);
        navigationValidator = mock(NavigationValidator.class);
        retriever = mock(KnowledgeRetriever.class);
        dataService = mock(AssistantDataService.class);
        promptBuilder = mock(PromptBuilder.class);
        llmProvider = mock(LlmProvider.class);
        responseValidator = mock(ResponseValidator.class);
        conversationService = mock(ConversationService.class);
        interactionLogger = mock(AiInteractionLogger.class);

        properties = new AiProperties();
        properties.setEnabled(true);
        properties.getMistral().setApiKey("test-key");

        service = new AiAssistantService(appUserRepository, properties, rateLimiter, navigationValidator,
                retriever, dataService, promptBuilder, llmProvider, responseValidator, conversationService,
                interactionLogger);

        when(navigationValidator.validateCurrentPage(any(), any())).thenReturn(Optional.empty());
        when(dataService.fetch(any(), any(), any())).thenReturn(new AssistantDataService.Selection(List.of(), List.of()));
        when(promptBuilder.buildSystemPrompt(any(), any(), any(), any())).thenReturn("system");
        when(promptBuilder.buildUserPrompt(any(), any())).thenReturn("user");
        when(conversationService.recentTurns(any())).thenReturn(List.of());
    }

    private static AppUser activeEmployee() {
        AppUser user = new AppUser();
        user.setId(1L);
        user.setEmail("employee@nforceone.com");
        user.setRole(AppUser.Role.EMPLOYEE);
        user.setStatus(AppUser.Status.ACTIVE);
        return user;
    }

    private AiConversation conversation() {
        AiConversation c = new AiConversation();
        c.setId(UUID.randomUUID());
        c.setUserId(1L);
        return c;
    }

    @Test
    void disabledAssistantDoesNoDbWorkAtAll() {
        properties.setEnabled(false);

        AssistantResponse response = service.chat("employee@nforceone.com", "hi", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(appUserRepository, rateLimiter, retriever, llmProvider, conversationService, interactionLogger);
    }

    @Test
    void enabledWithNoApiKeyIsAlsoTreatedAsUnusable() {
        properties.getMistral().setApiKey("");
        AssistantResponse response = service.chat("employee@nforceone.com", "hi", null, null);
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(appUserRepository);
    }

    @Test
    void unknownUserReturnsControlledDecline() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull("ghost@nforceone.com")).thenReturn(Optional.empty());
        AssistantResponse response = service.chat("ghost@nforceone.com", "hi", null, null);
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(rateLimiter, retriever, llmProvider);
    }

    @Test
    void inactiveUserReturnsControlledDecline() {
        AppUser inactive = activeEmployee();
        inactive.setStatus(AppUser.Status.INACTIVE);
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(inactive));

        AssistantResponse response = service.chat("employee@nforceone.com", "hi", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(rateLimiter, retriever, llmProvider);
    }

    @Test
    void emptyMessageIsDeclinedWithoutCallingRetrievalOrLlm() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));

        AssistantResponse response = service.chat("employee@nforceone.com", "   ", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(retriever, llmProvider, conversationService);
        verify(interactionLogger).record(argThat(t -> "EMPTY_MESSAGE".equals(t.errorCode())));
    }

    @Test
    void overlongMessageIsDeclinedWithoutCallingRetrievalOrLlm() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        properties.getLimits().setMaxMessageChars(10);

        AssistantResponse response = service.chat("employee@nforceone.com", "this message is way too long", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verifyNoInteractions(retriever, llmProvider);
        verify(interactionLogger).record(argThat(t -> "MESSAGE_TOO_LONG".equals(t.errorCode())));
    }

    @Test
    void rateLimitExceededPropagatesAfterLogging() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        doThrow(new AiRateLimitExceededException(30)).when(rateLimiter).checkAndRecord(1L);

        assertThrows(AiRateLimitExceededException.class,
                () -> service.chat("employee@nforceone.com", "how do I submit my EOD?", null, null));

        verify(interactionLogger).record(argThat(t -> "RATE_LIMITED".equals(t.errorCode())));
        verifyNoInteractions(retriever, llmProvider);
    }

    @Test
    void retrievalFailureDegradesWithoutRecordingAConversationTurn() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conversation());
        when(retriever.retrieve(any(), any())).thenThrow(new AiProviderException("boom"));

        AssistantResponse response = service.chat("employee@nforceone.com", "how do I submit my EOD?", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        assertNotNull(response.conversationId());
        verify(conversationService, never()).recordTurn(any(), any(), any(), any());
        verify(interactionLogger).record(argThat(t -> "RETRIEVAL_UNAVAILABLE".equals(t.errorCode())));
        verifyNoInteractions(llmProvider);
    }

    @Test
    void emptyRetrievalSkipsTheLlmButStillRecordsTheTurn() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        AiConversation conv = conversation();
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conv);
        when(retriever.retrieve(any(), any())).thenReturn(List.of());
        when(conversationService.recordTurn(eq(conv), anyString(), anyString(), eq("UNKNOWN"))).thenReturn(99L);

        AssistantResponse response = service.chat("employee@nforceone.com", "how do I submit my EOD?", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        assertEquals(99L, response.messageId());
        verifyNoInteractions(llmProvider);
        verify(conversationService).recordTurn(eq(conv), anyString(), anyString(), eq("UNKNOWN"));
        verify(interactionLogger).record(argThat(t -> "NO_KNOWLEDGE".equals(t.errorCode())));
    }

    @Test
    void llmFailureDegradesWithoutRecordingAConversationTurn() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conversation());
        when(retriever.retrieve(any(), any())).thenReturn(List.of(sampleResult()));
        when(llmProvider.complete(any(), any())).thenThrow(new AiProviderException("mistral down"));

        AssistantResponse response = service.chat("employee@nforceone.com", "how do I submit my EOD?", null, null);

        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        verify(conversationService, never()).recordTurn(any(), any(), any(), any());
        verify(interactionLogger).record(argThat(t -> "PROVIDER_UNAVAILABLE".equals(t.errorCode())));
    }

    @Test
    void happyPathReturnsValidatedResponseWithConversationAndMessageId() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        AiConversation conv = conversation();
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conv);
        when(retriever.retrieve(any(), any())).thenReturn(List.of(sampleResult()));
        when(llmProvider.complete(any(), any())).thenReturn(
                new LlmCompletion("{\"type\":\"HOW_TO\",\"answer\":\"Open Submit EOD.\"}", "mistral",
                        "ministral-8b-latest", 100, 20, 500, 1));
        AssistantResponse validated = new AssistantResponse(AssistantResponseType.HOW_TO, "Open Submit EOD.",
                List.of("Step 1"), new NavigationAction("eod-submit", "Submit EOD"), List.of(),
                ConfidenceLevel.HIGH, null, null);
        when(responseValidator.validate(anyString(), any())).thenReturn(validated);
        when(conversationService.recordTurn(eq(conv), anyString(), anyString(), eq("HOW_TO"))).thenReturn(7L);

        AssistantResponse response = service.chat("employee@nforceone.com", "how do I submit my EOD?", null, null);

        assertEquals(AssistantResponseType.HOW_TO, response.type());
        assertEquals(conv.getId().toString(), response.conversationId());
        assertEquals(7L, response.messageId());
        assertEquals("eod-submit", response.navigation().pageId());

        ArgumentCaptor<AiInteractionLogger.Turn> captor = ArgumentCaptor.forClass(AiInteractionLogger.Turn.class);
        verify(interactionLogger).record(captor.capture());
        assertTrue(captor.getValue().success());
        assertNull(captor.getValue().errorCode());
        assertEquals("mistral", captor.getValue().provider());
    }

    @Test
    void historyIsNeverTrustedAsAuthorityRoleIsAlwaysReResolvedFromTheDatabase() {
        // Even if a prior turn's text implied something, the role/context always comes from the
        // freshly-loaded AppUser row, never from conversation history.
        AppUser user = activeEmployee();
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(user));
        AiConversation conv = conversation();
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conv);
        when(retriever.retrieve(any(), any())).thenReturn(List.of(sampleResult()));
        when(llmProvider.complete(any(), any())).thenReturn(
                new LlmCompletion("{\"type\":\"EXPLANATION\",\"answer\":\"ans\"}", "mistral", "m", 1, 1, 1, 1));
        when(responseValidator.validate(anyString(), any())).thenReturn(
                new AssistantResponse(AssistantResponseType.EXPLANATION, "ans", List.of(), null, List.of(),
                        ConfidenceLevel.MEDIUM, null, null));

        service.chat("employee@nforceone.com", "question", null, null);

        ArgumentCaptor<com.nforceone.sync.ai.contract.AssistantRequestContext> ctxCaptor =
                ArgumentCaptor.forClass(com.nforceone.sync.ai.contract.AssistantRequestContext.class);
        verify(retriever).retrieve(any(), any());
        verify(promptBuilder).buildSystemPrompt(ctxCaptor.capture(), any(), any(), any());
        assertEquals(AppUser.Role.EMPLOYEE, ctxCaptor.getValue().role());
        assertEquals(1L, ctxCaptor.getValue().userId());
    }

    @Test
    void shortFollowUpQuestionBorrowsThePreviousQuestionForRetrievalOnly() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        AiConversation conv = conversation();
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conv);
        when(conversationService.recentTurns(conv.getId())).thenReturn(
                List.of(new com.nforceone.sync.ai.contract.ConversationTurn(
                        "Who can approve my EOD?", "Your Team Lead or a Project Manager on the project.")));
        when(retriever.retrieve(any(), any())).thenReturn(List.of(sampleResult()));
        when(llmProvider.complete(any(), any())).thenReturn(
                new LlmCompletion("{\"type\":\"EXPLANATION\",\"answer\":\"ans\"}", "mistral", "m", 1, 1, 1, 1));
        when(responseValidator.validate(anyString(), any())).thenReturn(
                new AssistantResponse(AssistantResponseType.EXPLANATION, "ans", List.of(), null, List.of(),
                        ConfidenceLevel.MEDIUM, null, null));

        service.chat("employee@nforceone.com", "why?", conv.getId().toString(), null);

        ArgumentCaptor<com.nforceone.sync.ai.contract.RetrievalQuery> captor =
                ArgumentCaptor.forClass(com.nforceone.sync.ai.contract.RetrievalQuery.class);
        verify(retriever).retrieve(captor.capture(), any());
        assertTrue(captor.getValue().rawQuery().contains("Who can approve my EOD?"),
                "a short follow-up should borrow the previous question's text for embedding");
        assertTrue(captor.getValue().rawQuery().contains("why?"));

        // The user-facing/model-facing question text must stay exactly what the user typed.
        verify(promptBuilder).buildUserPrompt(eq("why?"), any());
        verify(conversationService).recordTurn(eq(conv), eq("why?"), anyString(), anyString());
    }

    @Test
    void longQuestionNeverBorrowsPreviousContextEvenIfFollowUpContextIsEnabled() {
        when(appUserRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(activeEmployee()));
        AiConversation conv = conversation();
        when(conversationService.resolve(any(), eq(1L))).thenReturn(conv);
        when(conversationService.recentTurns(conv.getId())).thenReturn(
                List.of(new com.nforceone.sync.ai.contract.ConversationTurn("previous question", "previous answer")));
        when(retriever.retrieve(any(), any())).thenReturn(List.of(sampleResult()));
        when(llmProvider.complete(any(), any())).thenReturn(
                new LlmCompletion("{\"type\":\"EXPLANATION\",\"answer\":\"ans\"}", "mistral", "m", 1, 1, 1, 1));
        when(responseValidator.validate(anyString(), any())).thenReturn(
                new AssistantResponse(AssistantResponseType.EXPLANATION, "ans", List.of(), null, List.of(),
                        ConfidenceLevel.MEDIUM, null, null));

        String longQuestion = "a".repeat(100);
        service.chat("employee@nforceone.com", longQuestion, conv.getId().toString(), null);

        ArgumentCaptor<com.nforceone.sync.ai.contract.RetrievalQuery> captor =
                ArgumentCaptor.forClass(com.nforceone.sync.ai.contract.RetrievalQuery.class);
        verify(retriever).retrieve(captor.capture(), any());
        assertEquals(longQuestion, captor.getValue().rawQuery());
    }

    private static RetrievalResult sampleResult() {
        return new RetrievalResult("action.eod.day-types-and-submission", 0, KnowledgeType.ACTION, "eod",
                "eod-submit", "yaml:x", "Submitting an EOD", "Body text", 0.85);
    }
}
