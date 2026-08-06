import { useState } from 'react';
import { Paperclip, Smile, AtSign, Eye } from 'lucide-react';
import {
  useBlockerThread, useSendBlockerReply, type BlockerReplyDto, type ConversationScope,
} from '../api/blockerConversation';
import type { DateRange } from '../api/teamLead';

export function initials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const AVATAR_PALETTE = ['#7C5CFC', '#2F80ED', '#22B573', '#E0A93B', '#D9488B', '#3FA9D6', '#F2784B', '#9B6BD6'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export const TL_AVATAR_BG = 'var(--ok)';

export function Avatar({ name, bg, size = 30 }: { name: string; bg: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#fff',
    }}>
      {initials(name)}
    </div>
  );
}

function fmtDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

function ConversationMessage({ m }: { m: BlockerReplyDto }) {
  const isTeamLead = m.senderRole === 'TEAM_LEAD';
  const { date, time } = fmtDateTimeParts(m.createdAt);
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, marginLeft: isTeamLead ? 16 : 0 }}>
      <Avatar name={m.senderName} bg={isTeamLead ? TL_AVATAR_BG : avatarColor(m.senderName)} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>
            {m.senderName} <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}>({isTeamLead ? 'Team Lead' : 'Employee'})</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{date} {time}</span>
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--txt-mut)', lineHeight: 1.5, padding: '8px 12px', borderRadius: 8,
          background: isTeamLead ? 'color-mix(in srgb, var(--ok) 8%, transparent)' : 'var(--raised2)',
          border: `1px solid ${isTeamLead ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : 'var(--line2)'}`,
        }}>
          {m.message}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared conversation UI for a single blocker's thread — used by both the Team Lead's
 * Blockers detail panel and the employee's blocker view, so the two sides look and behave
 * identically. `scope` picks the access-controlled route; the thread itself is one shared
 * row set (see BlockerConversationService on the backend), not a per-side copy.
 */
export function BlockerThreadView({ taskId, scope, replyToLabel, visibilityNote, range }: {
  taskId: number;
  scope: ConversationScope;
  replyToLabel: string;
  visibilityNote: string;
  range?: DateRange;
}) {
  const { data: messages, isPending } = useBlockerThread(taskId, scope);
  const sendReply = useSendBlockerReply(taskId, scope, range);
  const [draft, setDraft] = useState('');

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    sendReply.mutate(text);
    setDraft('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {isPending ? (
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>Loading conversation…</div>
        ) : (messages ?? []).length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>No messages yet.</div>
        ) : (
          (messages ?? []).map(m => <ConversationMessage key={m.id} m={m} />)
        )}
      </div>

      <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)', marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 600, marginBottom: 8 }}>
          {replyToLabel}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message..."
          rows={3}
          style={{
            width: '100%', resize: 'none', padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
            background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
            marginBottom: 10, fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, color: 'var(--txt-dim)' }}>
            <Paperclip size={16} aria-hidden="true" style={{ cursor: 'pointer' }} />
            <Smile size={16} aria-hidden="true" style={{ cursor: 'pointer' }} />
            <AtSign size={16} aria-hidden="true" style={{ cursor: 'pointer' }} />
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sendReply.isPending}
            style={{
              padding: '8px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 8,
              background: 'var(--risk)', border: '1px solid var(--risk)', color: '#fff',
              cursor: !draft.trim() ? 'default' : 'pointer', opacity: !draft.trim() ? 0.6 : 1,
            }}
          >
            Send Reply
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-dim)', marginTop: 10 }}>
          <Eye size={12} aria-hidden="true" /> {visibilityNote}
        </div>
      </div>
    </div>
  );
}
