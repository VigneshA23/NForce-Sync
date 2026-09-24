import { useQuery } from "@tanstack/react-query";
import { api as apiClient } from "./client";

// Types mirror the backend DTOs field-for-field (com.nforceone.sync.ai.contract /
// com.nforceone.sync.ai.dto) — fixes a real OneHR bug where the frontend's RelatedItem shape
// didn't match what the backend actually sent.

export type AssistantResponseType =
  | "HOW_TO"
  | "EXPLANATION"
  | "NAVIGATION"
  | "TROUBLESHOOTING"
  | "PERMISSION"
  | "UNKNOWN";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface NavigationAction {
  pageId: string;
  label: string;
}

export interface RelatedItem {
  type: string | null;
  refId: string | null;
  label: string;
}

export interface AssistantResponse {
  type: AssistantResponseType;
  answer: string;
  steps: string[];
  navigation: NavigationAction | null;
  related: RelatedItem[];
  confidence: ConfidenceLevel;
  conversationId: string | null;
  messageId: number | null;
}

export interface AssistantMessageDto {
  id: number;
  sender: "USER" | "ASSISTANT";
  content: string;
  responseType: string | null;
  createdAt: string;
}

export interface AssistantHealth {
  enabled: boolean;
  indexReady: boolean;
  indexedChunks: number;
  lastIndexedAt: string | null;
  knowledgeSources: string[];
  llmProvider: string;
  embeddingProvider: string;
  embeddingDimensions: number;
  maxMessageChars: number;
}

export interface ChatRequest {
  message: string;
  conversationId?: string | null;
  currentPageId?: string | null;
}

export interface FeedbackRequest {
  conversationId: string;
  messageId?: number | null;
  rating: "UP" | "DOWN";
  comment?: string | null;
}

/** Thrown by {@link sendMessage} on HTTP 429 — carries what the panel needs for a countdown. */
export class AssistantRateLimitedError extends Error {
  retryAt: Date;
  retryAfterSeconds: number;

  constructor(retryAt: Date, retryAfterSeconds: number, message: string) {
    super(message);
    this.name = "AssistantRateLimitedError";
    this.retryAt = retryAt;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRateLimitBody(data: unknown): data is { code: string; retryAt: string; retryAfterSeconds: number; error: string } {
  return !!data && typeof data === "object" && (data as { code?: unknown }).code === "AI_ASSISTANT_RATE_LIMIT_EXCEEDED";
}

export async function sendMessage(request: ChatRequest): Promise<AssistantResponse> {
  try {
    // 60s — comfortably above the backend's own 45s per-turn deadline (app.ai.limits.turn-deadline-seconds).
    const { data } = await apiClient.post<AssistantResponse>("/ai-assistant/chat", request, { timeout: 60_000 });
    return data;
  } catch (err) {
    if (axiosStatus(err) === 429 && isRateLimitBody(axiosData(err))) {
      const body = axiosData(err) as { retryAt: string; retryAfterSeconds: number; error: string };
      throw new AssistantRateLimitedError(new Date(body.retryAt), body.retryAfterSeconds, body.error);
    }
    throw err;
  }
}

export async function fetchConversation(conversationId: string): Promise<AssistantMessageDto[]> {
  const { data } = await apiClient.get<AssistantMessageDto[]>(`/ai-assistant/conversations/${conversationId}`);
  return data;
}

export async function clearConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/ai-assistant/conversations/${conversationId}/clear`);
}

export async function sendFeedback(request: FeedbackRequest): Promise<void> {
  await apiClient.post("/ai-assistant/feedback", request);
}

export async function fetchHealth(): Promise<AssistantHealth> {
  const { data } = await apiClient.get<AssistantHealth>("/ai-assistant/health");
  return data;
}

/**
 * Gates the launcher's visibility. A failed health call hides the launcher silently (React
 * Query's default `isError` state, no toast) — a user who never knew the feature existed has
 * lost nothing.
 */
export function useAssistantHealth() {
  return useQuery({
    queryKey: ["ai-assistant", "health"],
    queryFn: fetchHealth,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---- Super Admin operational endpoints ------------------------------------------------------

export interface IndexingReport {
  documents: number;
  chunks: number;
  embedded: number;
  reused: number;
  removed: number;
  startedAt: string;
  finishedAt: string;
}

export interface AiRateLimitSettings {
  enabled: boolean;
  requestsPerWindow: number;
  windowMinutes: number;
  updatedAt: string;
}

export interface UpdateAiRateLimitSettingsRequest {
  enabled: boolean;
  requestsPerWindow: number;
  windowMinutes: number;
}

export interface AiUsageDailyPoint {
  date: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
}

export interface AiUsageBreakdownPoint {
  key: string;
  count: number;
}

export interface AiUsageStats {
  days: number;
  totalRequests: number;
  totalTurns: number;
  successCount: number;
  errorCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEmbeddingTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  daily: AiUsageDailyPoint[];
  byErrorCode: AiUsageBreakdownPoint[];
  byResponseType: AiUsageBreakdownPoint[];
}

export interface AiBilling {
  monthStart: string;
  today: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  monthlyBudgetUsd: number;
  estimatedCostUsd: number;
  usedPercent: number;
}

export interface AiBillingSettings {
  monthlyBudgetUsd: number;
  promptCostPerMillionUsd: number;
  completionCostPerMillionUsd: number;
  embeddingCostPerMillionUsd: number;
  updatedAt: string;
}

export interface UpdateAiBillingSettingsRequest {
  monthlyBudgetUsd: number;
  promptCostPerMillionUsd: number;
  completionCostPerMillionUsd: number;
  embeddingCostPerMillionUsd: number;
}

export async function reindex(): Promise<IndexingReport> {
  const { data } = await apiClient.post<IndexingReport>("/ai-assistant/admin/reindex", null, { timeout: 120_000 });
  return data;
}

export async function fetchRateLimitSettings(): Promise<AiRateLimitSettings> {
  const { data } = await apiClient.get<AiRateLimitSettings>("/ai-assistant/admin/rate-limit-settings");
  return data;
}

export async function updateRateLimitSettings(request: UpdateAiRateLimitSettingsRequest): Promise<AiRateLimitSettings> {
  const { data } = await apiClient.put<AiRateLimitSettings>("/ai-assistant/admin/rate-limit-settings", request);
  return data;
}

export async function fetchUsageStats(days: number): Promise<AiUsageStats> {
  const { data } = await apiClient.get<AiUsageStats>("/ai-assistant/admin/usage-stats", { params: { days } });
  return data;
}

export async function fetchBilling(): Promise<AiBilling> {
  const { data } = await apiClient.get<AiBilling>("/ai-assistant/admin/billing");
  return data;
}

export async function fetchBillingSettings(): Promise<AiBillingSettings> {
  const { data } = await apiClient.get<AiBillingSettings>("/ai-assistant/admin/billing-settings");
  return data;
}

export async function updateBillingSettings(request: UpdateAiBillingSettingsRequest): Promise<AiBillingSettings> {
  const { data } = await apiClient.put<AiBillingSettings>("/ai-assistant/admin/billing-settings", request);
  return data;
}

// axios error introspection without importing AxiosError as a value (isAxiosError avoids a
// hard dependency on the exact axios error shape changing between versions).
function axiosStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

function axiosData(err: unknown): unknown {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: unknown } }).response;
    return response?.data;
  }
  return undefined;
}
