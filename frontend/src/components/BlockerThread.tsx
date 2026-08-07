import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Paperclip, Smile, AtSign, Eye, Search, File as FileIcon, X, Download } from 'lucide-react';
import {
  useBlockerThread, useSendBlockerReply, useBlockerAttachmentUrl,
  type BlockerAttachmentDto, type BlockerReplyDto, type ConversationScope,
} from '../api/blockerConversation';
import type { DateRange } from '../api/teamLead';

// Kept in sync with BlockerConversationService's server-side limits — the server is the
// real guarantee, this is just for immediate feedback before a doomed upload is attempted.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_REPLY = 4;

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

// Curated set — no emoji-picker library is installed anywhere in the app, and this keeps
// the reply box dependency-free rather than pulling one in for a handful of reactions.
const EMOJI_OPTIONS = [
  '😀', '😂', '😅', '😉', '😊', '😍', '🤔', '😐', '😢', '😡',
  '👍', '👎', '🙏', '👏', '💪', '🤝', '✅', '❌', '⚠️', '🔥',
  '🚀', '💡', '⏰', '📌', '❓', '❗', '🎉', '👀', '💯', '🙌',
];

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

function AttachmentView({ attachment, scope }: { attachment: BlockerAttachmentDto; scope: ConversationScope }) {
  const { data: url, isPending } = useBlockerAttachmentUrl(scope, attachment.id);
  const isImage = attachment.contentType.startsWith('image/');

  if (isPending || !url) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', padding: '4px 0' }}>
        Loading {attachment.fileName}…
      </div>
    );
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
        <img
          src={url}
          alt={attachment.fileName}
          style={{ maxWidth: 180, maxHeight: 140, borderRadius: 8, border: '1px solid var(--line2)', display: 'block' }}
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      download={attachment.fileName}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6,
        background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
        fontSize: 12, textDecoration: 'none',
      }}
    >
      <FileIcon size={13} aria-hidden="true" />
      {attachment.fileName}
      <span style={{ color: 'var(--txt-dim)' }}>({fmtFileSize(attachment.fileSize)})</span>
      <Download size={12} aria-hidden="true" />
    </a>
  );
}

function ConversationMessage({ m, scope }: { m: BlockerReplyDto; scope: ConversationScope }) {
  const isTeamLead = m.senderRole === 'TEAM_LEAD';
  const { date, time } = fmtDateTimeParts(m.createdAt);
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
      <Avatar name={m.senderName} bg={isTeamLead ? TL_AVATAR_BG : avatarColor(m.senderName)} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>
            {m.senderName} <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}>({isTeamLead ? 'Team Lead' : 'Employee'})</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{date} {time}</span>
        </div>
        {m.message && (
          <div style={{
            fontSize: 12.5, color: 'var(--txt-mut)', lineHeight: 1.5, padding: '8px 12px', borderRadius: 8,
            background: isTeamLead ? 'color-mix(in srgb, var(--ok) 8%, transparent)' : 'var(--raised2)',
            border: `1px solid ${isTeamLead ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : 'var(--line2)'}`,
            marginBottom: m.attachments.length ? 6 : 0,
          }}>
            {m.message}
          </div>
        )}
        {m.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {m.attachments.map(a => <AttachmentView key={a.id} attachment={a} scope={scope} />)}
          </div>
        )}
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
export function BlockerThreadView({ taskId, scope, replyToLabel, visibilityNote, range, isLocked }: {
  taskId: number;
  scope: ConversationScope;
  replyToLabel: string;
  visibilityNote: string;
  range?: DateRange;
  isLocked?: boolean;
}) {
  const { data: messages, isPending } = useBlockerThread(taskId, scope);
  const sendReply = useSendBlockerReply(taskId, scope, range);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // Mention targets are scoped to this blocker's thread participants — the component only
  // knows about this one conversation, not the Team Lead's full roster.
  const participants = useMemo(() => {
    const names = new Set<string>();
    (messages ?? []).forEach(m => names.add(m.senderName));
    return [...names].sort();
  }, [messages]);
  const mentionResults = participants.filter(n => n.toLowerCase().includes(mentionQuery.trim().toLowerCase()));

  function handleSend() {
    if (isLocked) return;
    const text = draft.trim();
    if (!text) return;
    sendReply.mutate({ message: text, files: pendingFiles });
    setDraft('');
    setPendingFiles([]);
  }

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    const combined = [...pendingFiles, ...picked];
    if (combined.length > MAX_ATTACHMENTS_PER_REPLY) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS_PER_REPLY} files per reply`);
      return;
    }
    const tooBig = picked.find(f => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setAttachError(`"${tooBig.name}" exceeds the 5 MB attachment limit`);
      return;
    }
    setAttachError(null);
    setPendingFiles(combined);
  }

  function removePendingFile(index: number) {
    setPendingFiles(files => files.filter((_, i) => i !== index));
  }

  function insertAtCursor(insert: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + insert + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {isPending ? (
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>Loading conversation…</div>
        ) : (messages ?? []).length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>No messages yet.</div>
        ) : (
          (messages ?? []).map(m => <ConversationMessage key={m.id} m={m} scope={scope} />)
        )}
      </div>

      <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)', marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 600, marginBottom: 8 }}>
          {replyToLabel}
        </div>
        {isLocked ? (
          <div style={{
            padding: '12px 14px', borderRadius: 8, fontSize: 12.5, color: 'var(--txt-mut)',
            background: 'var(--raised2)', border: '1px solid var(--line2)',
          }}>
            This blocker has been marked resolved. Reply is disabled.
          </div>
        ) : (
        <>
        {pendingFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {pendingFiles.map((f, i) => (
              <span key={`${f.name}-${i}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 6px 3px 9px', borderRadius: 20,
                background: 'var(--raised2)', border: '1px solid var(--line2)', fontSize: 11.5, color: 'var(--txt)',
              }}>
                {f.name} <span style={{ color: 'var(--txt-dim)' }}>({fmtFileSize(f.size)})</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  aria-label={`Remove ${f.name}`}
                  style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 2 }}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachError && (
          <div style={{ fontSize: 11.5, color: 'var(--risk)', marginBottom: 6 }}>{attachError}</div>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message..."
          rows={3}
          style={{
            width: '100%', resize: 'none', padding: '10px 12px', borderRadius: '8px 8px 0 0', fontSize: 12.5,
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderBottom: 'none', color: 'var(--txt)',
            fontFamily: 'inherit', display: 'block',
          }}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 8px', borderRadius: '0 0 8px 8px',
          background: 'var(--raised2)', border: '1px solid var(--line2)', borderTop: '1px solid var(--line)',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--txt-dim)' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilesSelected}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              title={`Attach a file (up to ${MAX_ATTACHMENTS_PER_REPLY}, 5 MB each)`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
                background: 'none', border: 'none', borderRadius: 6, color: 'inherit', cursor: 'pointer',
              }}
            >
              <Paperclip size={16} aria-hidden="true" />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setEmojiOpen(o => !o); setMentionOpen(false); }}
                aria-label="Insert emoji"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
                  background: emojiOpen ? 'var(--raised2)' : 'none', border: 'none', borderRadius: 6,
                  color: 'inherit', cursor: 'pointer',
                }}
              >
                <Smile size={16} aria-hidden="true" />
              </button>
              {emojiOpen && (
                <>
                  <div onClick={() => setEmojiOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 20, width: 220,
                    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 8,
                    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2,
                  }}>
                    {EMOJI_OPTIONS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { insertAtCursor(e); setEmojiOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
                          background: 'none', border: 'none', borderRadius: 6, fontSize: 16, cursor: 'pointer',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setMentionOpen(o => !o); setEmojiOpen(false); setMentionQuery(''); }}
                aria-label="Mention someone"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
                  background: mentionOpen ? 'var(--raised2)' : 'none', border: 'none', borderRadius: 6,
                  color: 'inherit', cursor: 'pointer',
                }}
              >
                <AtSign size={16} aria-hidden="true" />
              </button>
              {mentionOpen && (
                <>
                  <div onClick={() => setMentionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 20, width: 200,
                    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 8,
                    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                  }}>
                    <div style={{ position: 'relative', marginBottom: 6 }}>
                      <Search size={12} aria-hidden="true" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
                      <input
                        autoFocus
                        value={mentionQuery}
                        onChange={(e) => setMentionQuery(e.target.value)}
                        placeholder="Search participants..."
                        style={{
                          width: '100%', padding: '5px 8px 5px 24px', fontSize: 11.5, borderRadius: 6,
                          background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                        }}
                      />
                    </div>
                    {mentionResults.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', padding: '6px 4px' }}>No participants found</div>
                    ) : mentionResults.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => { insertAtCursor(`@${name} `); setMentionOpen(false); setMentionQuery(''); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6,
                          background: 'none', border: 'none', color: 'var(--txt)', fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
        </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-dim)', marginTop: 10 }}>
          <Eye size={12} aria-hidden="true" /> {visibilityNote}
        </div>
      </div>
    </div>
  );
}
