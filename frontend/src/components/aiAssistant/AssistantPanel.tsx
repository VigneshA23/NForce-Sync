import { useEffect, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Send, X } from 'lucide-react';
import {
  AssistantRateLimitedError,
  clearConversation,
  fetchConversation,
  sendFeedback,
  sendMessage,
  type AssistantHealth,
} from '../../api/aiAssistant';
import {
  assistantReducer,
  canSend,
  initialAssistantState,
  MAX_MESSAGE_CHARS,
  secondsUntil,
} from './assistantState';
import { ASSISTANT_ROLE_CONTENT } from './assistantContent';
import { MessageList } from './MessageList';
import { pageIdFor } from '../../lib/ai/pageTargets';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import {
  bodyStyle,
  composerStyle,
  headerStyle,
  iconButtonStyle,
  panelContainerStyle,
} from './assistantStyles';
import { useDraggablePosition } from './useDraggablePosition';
import botAvatar from '../../assets/Bot Image.png';

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  currentPathname: string;
  health: AssistantHealth;
}

function storageKey(userId: number): string {
  return `nfsync.ai.conversation.${userId}`;
}

export function AssistantPanel({ open, onClose, currentPathname, health }: AssistantPanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(assistantReducer, initialAssistantState);
  const [draft, setDraft] = useState('');
  const [, forceTick] = useState(0); // re-renders the rate-limit countdown once a second
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { position: panelPosition, dragging: panelDragging, dragHandlers: panelDragHandlers } = useDraggablePosition({
    storageKey: user ? `nfsync.ai.panel.position.${user.id}` : null,
    defaultPosition: { right: 24, bottom: 92 },
    elementRef: panelRef,
  });

  // No scroll lock here (unlike Modal.tsx): the panel is a non-modal floating widget, so the
  // page underneath stays fully scrollable while it's open.

  const maxChars = health.maxMessageChars || MAX_MESSAGE_CHARS;
  const currentPageId = user ? pageIdFor(user.role, currentPathname) : null;

  // Replay from sessionStorage the first time the panel opens in this tab (I12 — OneHR loses the
  // conversation on close because it never persists the id at all).
  useEffect(() => {
    if (!open || !user || restoredRef.current) return;
    restoredRef.current = true;
    const savedId = sessionStorage.getItem(storageKey(user.id));
    if (!savedId) return;
    fetchConversation(savedId)
      .then((messages) => {
        if (messages.length > 0) {
          dispatch({ type: 'RESTORE', conversationId: savedId, messages });
        }
      })
      .catch(() => {
        // A foreign/expired id — start fresh silently, matching the backend's own tolerant behavior.
      });
  }, [open, user]);

  useEffect(() => {
    if (state.status !== 'rate-limited' || !state.rateLimitRetryAt) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [state.status, state.rateLimitRetryAt]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [state.messages, state.status]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!user) return null;

  async function ask(text: string) {
    if (!canSend(state, text, maxChars) || !user) return;
    const tempId = `local-${Date.now()}`;
    dispatch({ type: 'ASK', tempId, message: text.trim() });
    setDraft('');
    try {
      const response = await sendMessage({
        message: text.trim(),
        conversationId: state.conversationId,
        currentPageId,
      });
      dispatch({ type: 'ANSWER', tempId, response });
      if (response.conversationId) {
        sessionStorage.setItem(storageKey(user.id), response.conversationId);
      }
    } catch (err) {
      if (err instanceof AssistantRateLimitedError) {
        dispatch({ type: 'RATE_LIMITED', tempId, retryAt: err.retryAt, message: err.message });
      } else {
        dispatch({ type: 'FAIL', tempId, message: 'Something went wrong sending that. Please try again.' });
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  async function handleClear() {
    if (state.conversationId) {
      try { await clearConversation(state.conversationId); } catch { /* best-effort */ }
    }
    dispatch({ type: 'CLEAR' });
  }

  function handleFeedback(messageId: string, rating: 'UP' | 'DOWN', comment?: string) {
    dispatch({ type: 'FEEDBACK', messageId, rating });
    if (!state.conversationId) return;
    const numericId = Number(messageId);
    sendFeedback({
      conversationId: state.conversationId,
      messageId: Number.isNaN(numericId) ? undefined : numericId,
      rating,
      comment,
    }).catch(() => { /* best-effort — feedback never blocks the conversation */ });
  }

  function handleNavigate(route: string) {
    navigate(route);
    onClose();
  }

  const rateLimitSeconds = state.rateLimitRetryAt ? secondsUntil(state.rateLimitRetryAt) : 0;
  const rateLimited = state.status === 'rate-limited' && rateLimitSeconds > 0;
  const sendDisabled = !canSend(state, draft, maxChars);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="NISA — NForce Intelligent Sync Assistant"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 4 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          ref={panelRef}
          style={{ ...panelContainerStyle, right: panelPosition.right, bottom: panelPosition.bottom }}
          className="nf-ai-panel"
        >
          <div
            style={{
              ...headerStyle,
              cursor: panelDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: panelDragging ? 'none' : undefined,
            }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              panelDragHandlers.onPointerDown(e);
            }}
            onPointerMove={panelDragHandlers.onPointerMove}
            onPointerUp={panelDragHandlers.onPointerUp}
            onPointerCancel={panelDragHandlers.onPointerCancel}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src={botAvatar}
                alt=""
                width={32}
                height={32}
                draggable={false}
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, pointerEvents: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt)' }}>NISA</span>
                <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>NForce Intelligent Sync Assistant</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                aria-label="Clear conversation"
                onClick={handleClear}
                style={iconButtonStyle}
                disabled={state.messages.length === 0}
              >
                <RotateCcw size={16} />
              </button>
              <button aria-label="Close assistant" onClick={onClose} style={iconButtonStyle}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div ref={bodyRef} style={bodyStyle}>
            {state.messages.length === 0 && state.status === 'idle' && (
              <EmptyState role={user.role} firstName={user.name.split(' ')[0] || user.name} onAsk={ask} onNavigate={handleNavigate} />
            )}

            <MessageList
              messages={state.messages}
              role={user.role}
              onNavigate={handleNavigate}
              onAskRelated={ask}
              onFeedback={handleFeedback}
            />

            {state.status === 'sending' && <LoadingBubble />}

            {state.status === 'error' && state.errorMessage && (
              <div role="alert" style={{ fontSize: 12.5, color: 'var(--risk)' }}>
                {state.errorMessage}
              </div>
            )}

            {rateLimited && (
              <div role="alert" style={{ fontSize: 12.5, color: 'var(--warn)' }}>
                You've reached the usage limit. Try again in {rateLimitSeconds}s.
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} style={composerStyle}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about NForce Sync…"
                maxLength={maxChars}
                disabled={rateLimited}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)',
                  background: 'var(--shell)', color: 'var(--txt)', fontSize: 13.5,
                }}
                aria-label="Ask the assistant a question"
              />
              <button
                type="submit"
                disabled={sendDisabled || rateLimited}
                aria-label="Send"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 8, border: 'none',
                  background: sendDisabled || rateLimited ? 'var(--line)' : 'var(--brand)',
                  color: '#fff', cursor: sendDisabled || rateLimited ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
            </div>
            {draft.length > maxChars * 0.8 && (
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', textAlign: 'right' }}>
                {draft.length} / {maxChars}
              </div>
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: 0.4,
};

const QUESTION_BUTTON_STYLE: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--raised2)', color: 'var(--txt)', fontSize: 12.5, cursor: 'pointer',
};

const ACTION_ROW_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '7px 10px',
  borderRadius: 8, border: '1px solid var(--line)', background: 'var(--raised2)',
  color: 'var(--txt)', fontSize: 12.5, cursor: 'pointer',
};

// Same tinted-square formula as KpiCard.tsx's icon container, sized down for a compact list row.
const ACTION_ICON_STYLE: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
  background: 'color-mix(in srgb, var(--brand) 16%, var(--raised2))',
  boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand) 22%, transparent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)',
};

function EmptyState({
  role,
  firstName,
  onAsk,
  onNavigate,
}: {
  role: Role;
  firstName: string;
  onAsk: (text: string) => void;
  onNavigate: (route: string) => void;
}) {
  const content = ASSISTANT_ROLE_CONTENT[role];
  const fallbackQuestions = ['How do I submit my EOD?', 'Where can I see my utilization?', 'What happens after I submit an EOD?'];
  const questions = content?.popularQuestions ?? fallbackQuestions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
      <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
        Hi {firstName}, I'm NISA — NForce Intelligent Sync Assistant. I can help you find your way around Sync.
      </p>

      {content && content.quickActions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={SECTION_LABEL_STYLE}>Quick Actions</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {content.quickActions.map((qa) => (
              <button key={qa.route} onClick={() => onNavigate(qa.route)} style={ACTION_ROW_STYLE}>
                <span style={ACTION_ICON_STYLE}>
                  <qa.icon size={13} />
                </span>
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {content && <span style={SECTION_LABEL_STYLE}>Popular Questions</span>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {questions.map((q) => (
            <button key={q} onClick={() => onAsk(q)} style={QUESTION_BUTTON_STYLE}>
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingBubble() {
  const dotStyle = { width: 6, height: 6, borderRadius: '50%', background: 'var(--txt-mut)' };
  return (
    <div
      aria-live="polite"
      aria-label="Assistant is thinking"
      style={{
        alignSelf: 'flex-start', padding: '10px 12px', borderRadius: 12,
        background: 'var(--raised2)', border: '1px solid var(--line)', display: 'flex', gap: 4,
      }}
    >
      <span className="nf-ai-typing-dot" style={dotStyle} />
      <span className="nf-ai-typing-dot" style={dotStyle} />
      <span className="nf-ai-typing-dot" style={dotStyle} />
    </div>
  );
}
