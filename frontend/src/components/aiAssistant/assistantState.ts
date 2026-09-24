import type {
  AssistantMessageDto,
  AssistantResponse,
  AssistantResponseType,
  ConfidenceLevel,
  NavigationAction,
  RelatedItem,
} from '../../api/aiAssistant';

/** Mirrors app.ai.limits.max-message-chars's default — the real limit comes from /health once loaded; this is only the pre-load hint shown while typing. */
export const MAX_MESSAGE_CHARS = 1000;

export interface AssistantMessage {
  /** Server message id (assistant turns only) as a string, or a client-generated temp id for an in-flight user message. */
  id: string;
  sender: 'USER' | 'ASSISTANT';
  content: string;
  responseType?: AssistantResponseType;
  navigation?: NavigationAction | null;
  steps?: string[];
  related?: RelatedItem[];
  confidence?: ConfidenceLevel;
  serverMessageId?: number | null;
  pending?: boolean;
  feedback?: 'UP' | 'DOWN';
}

export type AssistantStatus = 'idle' | 'sending' | 'error' | 'rate-limited';

export interface AssistantState {
  messages: AssistantMessage[];
  conversationId: string | null;
  status: AssistantStatus;
  errorMessage: string | null;
  rateLimitRetryAt: Date | null;
}

export const initialAssistantState: AssistantState = {
  messages: [],
  conversationId: null,
  status: 'idle',
  errorMessage: null,
  rateLimitRetryAt: null,
};

export type AssistantAction =
  | { type: 'ASK'; tempId: string; message: string }
  | { type: 'ANSWER'; tempId: string; response: AssistantResponse }
  | { type: 'FAIL'; tempId: string; message: string }
  | { type: 'RATE_LIMITED'; tempId: string; retryAt: Date; message: string }
  | { type: 'RESTORE'; conversationId: string; messages: AssistantMessageDto[] }
  | { type: 'CLEAR' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'FEEDBACK'; messageId: string; rating: 'UP' | 'DOWN' };

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case 'ASK':
      return {
        ...state,
        status: 'sending',
        errorMessage: null,
        messages: [...state.messages, { id: action.tempId, sender: 'USER', content: action.message }],
      };

    case 'ANSWER': {
      const response = action.response;
      const assistantMessage: AssistantMessage = {
        id: response.messageId != null ? String(response.messageId) : action.tempId + '-a',
        sender: 'ASSISTANT',
        content: response.answer,
        responseType: response.type,
        navigation: response.navigation,
        steps: response.steps,
        related: response.related,
        confidence: response.confidence,
        serverMessageId: response.messageId,
      };
      return {
        ...state,
        status: 'idle',
        conversationId: response.conversationId ?? state.conversationId,
        messages: [...state.messages, assistantMessage],
      };
    }

    case 'FAIL':
      return {
        ...state,
        status: 'error',
        errorMessage: action.message,
        // The failed user message stays in the transcript (it was genuinely sent/typed) — only
        // the reducer's "sending" spinner clears, so the user can see what they asked and retry.
      };

    case 'RATE_LIMITED':
      return {
        ...state,
        status: 'rate-limited',
        errorMessage: action.message,
        rateLimitRetryAt: action.retryAt,
      };

    case 'RESTORE':
      return {
        ...state,
        conversationId: action.conversationId,
        messages: action.messages.map((m) => ({
          id: String(m.id),
          sender: m.sender,
          content: m.content,
          responseType: (m.responseType as AssistantResponseType | undefined) ?? undefined,
          serverMessageId: m.sender === 'ASSISTANT' ? m.id : undefined,
        })),
      };

    case 'CLEAR':
      // Conversation id is kept (mirrors the backend: clear deletes messages, not the conversation row).
      return { ...state, messages: [], status: 'idle', errorMessage: null, rateLimitRetryAt: null };

    case 'DISMISS_ERROR':
      return { ...state, status: 'idle', errorMessage: null, rateLimitRetryAt: null };

    case 'FEEDBACK':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, feedback: action.rating } : m,
        ),
      };

    default:
      return state;
  }
}

export function canSend(state: AssistantState, text: string, maxChars: number): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > maxChars) {
    return false;
  }
  if (state.status === 'sending') {
    return false;
  }
  if (state.status === 'rate-limited' && state.rateLimitRetryAt && state.rateLimitRetryAt.getTime() > Date.now()) {
    return false;
  }
  return true;
}

/** Seconds remaining until a rate limit clears, floored at 0 — drives the panel's live countdown (I13; OneHR's equivalent was static text). */
export function secondsUntil(target: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 1000));
}
