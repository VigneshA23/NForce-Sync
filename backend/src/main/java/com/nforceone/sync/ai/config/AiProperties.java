package com.nforceone.sync.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;

/**
 * Typed configuration for the Sync AI assistant, bound from {@code app.ai.*} in application.yml
 * (overridable via env vars) plus the gitignored application-local.yml for the Mistral API key.
 *
 * <p>There is no other {@code @ConfigurationProperties} class in Sync today — every other module
 * reads config with {@code @Value}. This is a deliberate, self-contained exception: the AI module
 * has enough related settings (mistral.*, retrieval.*, limits.*, retention.*) that a typed record
 * of records is materially safer than a page of {@code @Value} fields.
 */
@ConfigurationProperties(prefix = "app.ai")
public class AiProperties {

    /** Master switch. False by default so Sync boots normally with no AI credentials at all. */
    private boolean enabled = false;

    /** Reported by /health only. Mistral is the only implemented provider. */
    private String provider = "mistral";

    /** Whether AssistantDataService may call any live-data provider at all. */
    private boolean liveDataEnabled = true;

    @NestedConfigurationProperty
    private Mistral mistral = new Mistral();

    @NestedConfigurationProperty
    private Retrieval retrieval = new Retrieval();

    @NestedConfigurationProperty
    private Limits limits = new Limits();

    @NestedConfigurationProperty
    private Retention retention = new Retention();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public boolean isLiveDataEnabled() {
        return liveDataEnabled;
    }

    public void setLiveDataEnabled(boolean liveDataEnabled) {
        this.liveDataEnabled = liveDataEnabled;
    }

    public Mistral getMistral() {
        return mistral;
    }

    public void setMistral(Mistral mistral) {
        this.mistral = mistral;
    }

    public Retrieval getRetrieval() {
        return retrieval;
    }

    public void setRetrieval(Retrieval retrieval) {
        this.retrieval = retrieval;
    }

    public Limits getLimits() {
        return limits;
    }

    public void setLimits(Limits limits) {
        this.limits = limits;
    }

    public Retention getRetention() {
        return retention;
    }

    public void setRetention(Retention retention) {
        this.retention = retention;
    }

    /** Returns true only when the feature is switched on AND a non-blank API key is configured. */
    public boolean isUsable() {
        return enabled && mistral.getApiKey() != null && !mistral.getApiKey().isBlank();
    }

    public static class Mistral {
        private String apiKey;
        private String baseUrl = "https://api.mistral.ai";
        private String chatModel = "ministral-8b-latest";
        private String embedModel = "mistral-embed";
        private int timeoutSeconds = 30;
        private int connectTimeoutSeconds = 5;
        private int maxAttempts = 3;
        private long retryBackoffMillis = 500;
        private double temperature = 0.2;
        private int maxTokens = 1200;

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getChatModel() {
            return chatModel;
        }

        public void setChatModel(String chatModel) {
            this.chatModel = chatModel;
        }

        public String getEmbedModel() {
            return embedModel;
        }

        public void setEmbedModel(String embedModel) {
            this.embedModel = embedModel;
        }

        public int getTimeoutSeconds() {
            return timeoutSeconds;
        }

        public void setTimeoutSeconds(int timeoutSeconds) {
            this.timeoutSeconds = timeoutSeconds;
        }

        public int getConnectTimeoutSeconds() {
            return connectTimeoutSeconds;
        }

        public void setConnectTimeoutSeconds(int connectTimeoutSeconds) {
            this.connectTimeoutSeconds = connectTimeoutSeconds;
        }

        public int getMaxAttempts() {
            return maxAttempts;
        }

        public void setMaxAttempts(int maxAttempts) {
            this.maxAttempts = maxAttempts;
        }

        public long getRetryBackoffMillis() {
            return retryBackoffMillis;
        }

        public void setRetryBackoffMillis(long retryBackoffMillis) {
            this.retryBackoffMillis = retryBackoffMillis;
        }

        public double getTemperature() {
            return temperature;
        }

        public void setTemperature(double temperature) {
            this.temperature = temperature;
        }

        public int getMaxTokens() {
            return maxTokens;
        }

        public void setMaxTokens(int maxTokens) {
            this.maxTokens = maxTokens;
        }
    }

    public static class Retrieval {
        private int topK = 8;
        private double minScore = 0.60;
        private int candidateMultiplier = 3;
        private int maxContextChars = 12000;
        private boolean followUpContext = true;

        public int getTopK() {
            return topK;
        }

        public void setTopK(int topK) {
            this.topK = topK;
        }

        public double getMinScore() {
            return minScore;
        }

        public void setMinScore(double minScore) {
            this.minScore = minScore;
        }

        public int getCandidateMultiplier() {
            return candidateMultiplier;
        }

        public void setCandidateMultiplier(int candidateMultiplier) {
            this.candidateMultiplier = candidateMultiplier;
        }

        public int getMaxContextChars() {
            return maxContextChars;
        }

        public void setMaxContextChars(int maxContextChars) {
            this.maxContextChars = maxContextChars;
        }

        public boolean isFollowUpContext() {
            return followUpContext;
        }

        public void setFollowUpContext(boolean followUpContext) {
            this.followUpContext = followUpContext;
        }
    }

    public static class Limits {
        private int maxMessageChars = 1000;
        private int maxHistoryTurns = 6;
        private int maxHistoryChars = 6000;
        private int turnDeadlineSeconds = 45;

        public int getMaxMessageChars() {
            return maxMessageChars;
        }

        public void setMaxMessageChars(int maxMessageChars) {
            this.maxMessageChars = maxMessageChars;
        }

        public int getMaxHistoryTurns() {
            return maxHistoryTurns;
        }

        public void setMaxHistoryTurns(int maxHistoryTurns) {
            this.maxHistoryTurns = maxHistoryTurns;
        }

        public int getMaxHistoryChars() {
            return maxHistoryChars;
        }

        public void setMaxHistoryChars(int maxHistoryChars) {
            this.maxHistoryChars = maxHistoryChars;
        }

        public int getTurnDeadlineSeconds() {
            return turnDeadlineSeconds;
        }

        public void setTurnDeadlineSeconds(int turnDeadlineSeconds) {
            this.turnDeadlineSeconds = turnDeadlineSeconds;
        }
    }

    public static class Retention {
        private boolean enabled = true;
        private int messageDays = 90;
        private int logDays = 365;
        private String cron = "0 30 2 * * *";

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public int getMessageDays() {
            return messageDays;
        }

        public void setMessageDays(int messageDays) {
            this.messageDays = messageDays;
        }

        public int getLogDays() {
            return logDays;
        }

        public void setLogDays(int logDays) {
            this.logDays = logDays;
        }

        public String getCron() {
            return cron;
        }

        public void setCron(String cron) {
            this.cron = cron;
        }
    }
}
