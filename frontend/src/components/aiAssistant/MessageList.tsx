import { useState } from 'react';
import { ArrowRight, Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AssistantMessage } from './assistantState';
import { assistantBubbleStyle, userBubbleStyle } from './assistantStyles';
import { resolvePageTarget } from '../../lib/ai/pageTargets';
import type { Role } from '../../lib/types';

interface MessageListProps {
  messages: AssistantMessage[];
  role: Role;
  onNavigate: (route: string) => void;
  onAskRelated: (label: string) => void;
  onFeedback: (messageId: string, rating: 'UP' | 'DOWN', comment?: string) => void;
}

export function MessageList({ messages, role, onNavigate, onAskRelated, onFeedback }: MessageListProps) {
  return (
    <>
      {messages.map((message) =>
        message.sender === 'USER' ? (
          <div key={message.id} style={userBubbleStyle}>
            {message.content}
          </div>
        ) : (
          <AssistantBubble
            key={message.id}
            message={message}
            role={role}
            onNavigate={onNavigate}
            onAskRelated={onAskRelated}
            onFeedback={onFeedback}
          />
        ),
      )}
    </>
  );
}

function AssistantBubble({
  message,
  role,
  onNavigate,
  onAskRelated,
  onFeedback,
}: {
  message: AssistantMessage;
  role: Role;
  onNavigate: (route: string) => void;
  onAskRelated: (label: string) => void;
  onFeedback: (messageId: string, rating: 'UP' | 'DOWN', comment?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');

  const navTarget = message.navigation ? resolvePageTarget(message.navigation.pageId, role) : null;
  const showLowConfidenceNote = message.confidence === 'LOW' && message.responseType !== 'UNKNOWN';

  function copyAnswer() {
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  function submitFeedback(rating: 'UP' | 'DOWN') {
    if (rating === 'DOWN' && !showCommentBox) {
      setShowCommentBox(true);
      return;
    }
    onFeedback(message.id, rating, comment.trim() || undefined);
    setShowCommentBox(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, maxWidth: '90%' }}>
      <div style={assistantBubbleStyle} aria-live="polite">
        {message.content}

        {message.steps && message.steps.length > 0 && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {message.steps.map((step, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{step}</li>
            ))}
          </ol>
        )}

        {showLowConfidenceNote && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warn)' }}>
            Low confidence — worth double-checking.
          </div>
        )}
      </div>

      {navTarget && (
        <button
          onClick={() => onNavigate(navTarget.route)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--brand)',
            background: 'transparent', color: 'var(--brand-bright)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Open {navTarget.label} <ArrowRight size={14} />
        </button>
      )}

      {message.related && message.related.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {message.related.map((item, i) => (
            <button
              key={i}
              onClick={() => onAskRelated(item.label)}
              style={{
                padding: '4px 10px', borderRadius: 999, border: '1px solid var(--line)',
                background: 'var(--raised2)', color: 'var(--txt-mut)', fontSize: 12, cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          aria-label="Copy answer"
          onClick={copyAnswer}
          style={{ ...iconBtn }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          aria-label="Good answer"
          aria-pressed={message.feedback === 'UP'}
          onClick={() => submitFeedback('UP')}
          style={{ ...iconBtn, color: message.feedback === 'UP' ? 'var(--ok)' : undefined }}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          aria-label="Bad answer"
          aria-pressed={message.feedback === 'DOWN'}
          onClick={() => submitFeedback('DOWN')}
          style={{ ...iconBtn, color: message.feedback === 'DOWN' ? 'var(--risk)' : undefined }}
        >
          <ThumbsDown size={14} />
        </button>
      </div>

      {showCommentBox && (
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong? (optional)"
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'var(--shell)', color: 'var(--txt)', fontSize: 12,
            }}
            maxLength={1000}
          />
          <button
            onClick={() => submitFeedback('DOWN')}
            style={{
              padding: '6px 10px', borderRadius: 6, border: 'none',
              background: 'var(--brand)', color: '#fff', fontSize: 12, cursor: 'pointer',
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--txt-mut)', cursor: 'pointer',
} as const;
