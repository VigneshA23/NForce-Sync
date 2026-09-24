package com.nforceone.sync.ai.controller;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.KnowledgeIndexRepository;
import com.nforceone.sync.ai.dto.AssistantChatRequest;
import com.nforceone.sync.ai.dto.AssistantFeedbackRequest;
import com.nforceone.sync.ai.dto.AssistantHealthResponse;
import com.nforceone.sync.ai.dto.AssistantMessageDto;
import com.nforceone.sync.ai.dto.AiBillingResponse;
import com.nforceone.sync.ai.dto.AiBillingSettingsResponse;
import com.nforceone.sync.ai.dto.AiRateLimitSettingsResponse;
import com.nforceone.sync.ai.dto.AiUsageStatsResponse;
import com.nforceone.sync.ai.dto.IndexingReport;
import com.nforceone.sync.ai.dto.UpdateAiBillingSettingsRequest;
import com.nforceone.sync.ai.dto.UpdateAiRateLimitSettingsRequest;
import com.nforceone.sync.ai.exception.AiRateLimitExceededException;
import com.nforceone.sync.ai.knowledge.KnowledgeIndexingService;
import com.nforceone.sync.ai.observability.AiInteractionLogger;
import com.nforceone.sync.ai.response.UnknownResponses;
import com.nforceone.sync.ai.service.AiAssistantService;
import com.nforceone.sync.ai.service.AiBillingSettingsService;
import com.nforceone.sync.ai.service.AiRateLimitSettingsService;
import com.nforceone.sync.ai.service.AiUsageStatsService;
import com.nforceone.sync.ai.service.ConversationService;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * The Sync AI assistant API, {@code /api/ai-assistant}. Covered by SecurityConfig's existing
 * {@code anyRequest().authenticated()} — no filter-chain change was needed for this module.
 *
 * <p>Request bodies never carry a role, permission, or user id claim — the authenticated
 * principal (an email, per Sync's existing {@code JwtFilter} convention) is the only source of
 * identity, resolved fresh on every call exactly like every other Sync controller.
 *
 * <p>The {@code /admin/*} endpoints are Super-Admin-only — AI cost/index/rate-limit
 * administration has no narrower owner in Sync's current role model (Admin does not have
 * operational access to AI internals).
 */
@RestController
@RequestMapping("/api/ai-assistant")
public class AiAssistantController {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantController.class);

    private final AiProperties properties;
    private final KnowledgeIndexRepository indexRepository;
    private final AiAssistantService assistantService;
    private final ConversationService conversationService;
    private final AiInteractionLogger interactionLogger;
    private final AppUserRepository appUserRepository;
    private final KnowledgeIndexingService indexingService;
    private final AiRateLimitSettingsService rateLimitSettingsService;
    private final AiUsageStatsService usageStatsService;
    private final AiBillingSettingsService billingSettingsService;

    public AiAssistantController(AiProperties properties, KnowledgeIndexRepository indexRepository,
            AiAssistantService assistantService, ConversationService conversationService,
            AiInteractionLogger interactionLogger, AppUserRepository appUserRepository,
            KnowledgeIndexingService indexingService, AiRateLimitSettingsService rateLimitSettingsService,
            AiUsageStatsService usageStatsService, AiBillingSettingsService billingSettingsService) {
        this.properties = properties;
        this.indexRepository = indexRepository;
        this.assistantService = assistantService;
        this.conversationService = conversationService;
        this.interactionLogger = interactionLogger;
        this.appUserRepository = appUserRepository;
        this.indexingService = indexingService;
        this.rateLimitSettingsService = rateLimitSettingsService;
        this.usageStatsService = usageStatsService;
        this.billingSettingsService = billingSettingsService;
    }

    /**
     * The primary defense against anything reaching {@code /error} as a bare, dangerous status —
     * see {@code AiExceptionHandler}'s class javadoc. Anything not deliberately thrown as
     * {@link AiRateLimitExceededException} (which the advice maps to 429) becomes a controlled
     * 200 UNKNOWN here, without ever leaving this method frame.
     */
    @PostMapping("/chat")
    public ResponseEntity<AssistantResponse> chat(@Valid @RequestBody AssistantChatRequest request) {
        try {
            AssistantResponse response = assistantService.chat(
                    actingEmail(), request.message(), request.conversationId(), request.currentPageId());
            return ResponseEntity.ok(response);
        } catch (AiRateLimitExceededException e) {
            throw e; // let AiExceptionHandler map this one deliberately to 429
        } catch (RuntimeException e) {
            log.error("Unhandled exception in AI assistant chat", e);
            return ResponseEntity.ok(UnknownResponses.malformedResponse());
        }
    }

    @GetMapping("/conversations/{id}")
    public List<AssistantMessageDto> getConversation(@PathVariable String id) {
        return conversationService.transcript(id, currentUserId());
    }

    @PostMapping("/conversations/{id}/clear")
    public ResponseEntity<Void> clearConversation(@PathVariable String id) {
        conversationService.clear(id, currentUserId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/feedback")
    public ResponseEntity<Void> feedback(@Valid @RequestBody AssistantFeedbackRequest request) {
        UUID conversationId;
        try {
            conversationId = UUID.fromString(request.conversationId().trim());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.noContent().build(); // tolerant/privacy-conscious — never reveals whether a conversation exists
        }
        interactionLogger.recordFeedback(conversationId, request.messageId(), currentUserId(),
                request.rating(), request.comment());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/health")
    public AssistantHealthResponse health() {
        if (!properties.isUsable()) {
            // Disabled or unconfigured: report that alone, no DB work (I18 — a disabled
            // assistant must not cost a query on every page load).
            return new AssistantHealthResponse(false, false, 0, null,
                    List.of(), properties.getProvider(), properties.getMistral().getEmbedModel(),
                    KnowledgeIndexRepository.EMBEDDING_DIMENSIONS, properties.getLimits().getMaxMessageChars());
        }
        long chunks = indexRepository.count();
        return new AssistantHealthResponse(
                true,
                chunks > 0,
                chunks,
                indexRepository.lastIndexedAt().orElse(null),
                List.of("yaml"),
                properties.getProvider(),
                properties.getMistral().getEmbedModel(),
                KnowledgeIndexRepository.EMBEDDING_DIMENSIONS,
                properties.getLimits().getMaxMessageChars());
    }

    // ---- Admin (Super Admin only) -----------------------------------------------------------

    @PostMapping("/admin/reindex")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public IndexingReport reindex() {
        return indexingService.reindex();
    }

    @GetMapping("/admin/rate-limit-settings")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiRateLimitSettingsResponse getRateLimitSettings() {
        var s = rateLimitSettingsService.getSettings();
        return new AiRateLimitSettingsResponse(s.isEnabled(), s.getRequestsPerWindow(), s.getWindowMinutes(), s.getUpdatedAt());
    }

    @PutMapping("/admin/rate-limit-settings")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiRateLimitSettingsResponse updateRateLimitSettings(@Valid @RequestBody UpdateAiRateLimitSettingsRequest request) {
        var s = rateLimitSettingsService.updateSettings(request.enabled(), request.requestsPerWindow(), request.windowMinutes());
        return new AiRateLimitSettingsResponse(s.isEnabled(), s.getRequestsPerWindow(), s.getWindowMinutes(), s.getUpdatedAt());
    }

    @GetMapping("/admin/usage-stats")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiUsageStatsResponse getUsageStats(@RequestParam(required = false) Integer days) {
        return usageStatsService.getStats(days);
    }

    @GetMapping("/admin/billing")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiBillingResponse getBilling() {
        return billingSettingsService.computeBilling();
    }

    @GetMapping("/admin/billing-settings")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiBillingSettingsResponse getBillingSettings() {
        var s = billingSettingsService.getSettings();
        return new AiBillingSettingsResponse(s.getMonthlyBudgetUsd(), s.getPromptCostPerMillionUsd(),
                s.getCompletionCostPerMillionUsd(), s.getEmbeddingCostPerMillionUsd(), s.getUpdatedAt());
    }

    @PutMapping("/admin/billing-settings")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public AiBillingSettingsResponse updateBillingSettings(@Valid @RequestBody UpdateAiBillingSettingsRequest request) {
        var s = billingSettingsService.updateSettings(request.monthlyBudgetUsd(), request.promptCostPerMillionUsd(),
                request.completionCostPerMillionUsd(), request.embeddingCostPerMillionUsd());
        return new AiBillingSettingsResponse(s.getMonthlyBudgetUsd(), s.getPromptCostPerMillionUsd(),
                s.getCompletionCostPerMillionUsd(), s.getEmbeddingCostPerMillionUsd(), s.getUpdatedAt());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    private Long currentUserId() {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return user.getId();
    }
}
