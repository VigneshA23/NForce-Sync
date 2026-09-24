package com.nforceone.sync.ai.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import jakarta.annotation.PostConstruct;

/**
 * Wires {@link AiProperties} and logs the feature's effective state exactly once at startup.
 *
 * <p>{@code @EnableScheduling} is already active application-wide (see {@code SyncApplication}),
 * so no second scheduling annotation is added here — {@link com.nforceone.sync.ai.service.AiRateLimiter}
 * and {@link com.nforceone.sync.ai.observability.AiRetentionJob} rely on the existing one.
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    private final AiProperties properties;

    public AiConfig(AiProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void logEffectiveState() {
        if (!properties.isEnabled()) {
            log.info("AI assistant: disabled (app.ai.enabled=false). Sync starts normally without it.");
            return;
        }
        if (!properties.isUsable()) {
            log.warn("AI assistant: enabled but no Mistral API key is configured (app.ai.mistral.api-key). "
                    + "The feature will report itself unavailable via /health; Sync startup is unaffected.");
            return;
        }
        log.info("AI assistant: enabled, provider={}, chat-model={}, embed-model={}",
                properties.getProvider(), properties.getMistral().getChatModel(), properties.getMistral().getEmbedModel());
    }
}
