import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Paperclip, Smile, AtSign, Eye, Search, File as FileIcon, X, Download, AlertCircle,
  Pencil, Trash2, Copy,
} from 'lucide-react';
import {
  useBlockerThread, useSendBlockerReply, useEditBlockerReply, useDeleteBlockerReply, fetchBlockerAttachmentUrl,
  type ConversationScope,
} from '../api/blockerConversation';
import type { DateRange } from '../api/teamLead';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { GlobalLoader } from './GlobalLoader';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';
import { ConfirmModal } from './ConfirmModal';
import {
  ALLOWED_ATTACHMENT_TYPES, ALLOWED_ATTACHMENT_TYPES_LABEL, MAX_ATTACHMENT_BYTES, validateAttachmentFile,
} from '../lib/eodAttachments';

/** Matches the extractError helper duplicated in SubmitEOD.tsx / approvals/shared.tsx. */
function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Failed to send reply. Please try again.';
}

// Type allowlist and per-file size cap are the same shared limits as EOD attachments (see
// eodAttachments.ts — mirrored server-side by EodAttachmentValidation and configured via
// application.yml's app.eod-attachment.*), reused here rather than a separate hardcoded set so
// size/type governance stays consistent app-wide. Only the per-reply attachment count is a
// Blockers-specific limit.
const MAX_ATTACHMENTS_PER_REPLY = 4;
/** Passed to the file input's `accept` so the OS picker itself filters — a courtesy, not the
 *  guarantee: browsers only enforce `accept` loosely, so handleFilesSelected re-checks `file.type`. */
const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(',');

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

// ── generic thread view — shared by Blockers and EOD Clarification ─────────────
// Everything below (attachments/emoji/@mention compose box, message list, locked state) is pure
// UI with no blocker-specific data fetching baked in: it takes messages/isPending/onSend/
// fetchAttachmentUrl as props instead of calling useBlockerThread/useSendBlockerReply/
// useBlockerAttachmentUrl directly, so a second feature (EOD Clarification) can reuse the exact
// same compose UI wired to its own hooks rather than forking a second copy. BlockerThreadView
// (below) is now a thin adapter over ThreadView; ClarificationThreadView (ClarificationThread.tsx)
// is the other one.

export interface GenericThreadAttachment {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface GenericThreadMessage {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: 'EMPLOYEE' | 'TEAM_LEAD';
  createdAt: string;
  message: string;
  attachments: GenericThreadAttachment[];
}

// Plain async function, not a hook — a prop can't be a *call* to a hook like
// useBlockerAttachmentUrl itself (react-hooks/rules-of-hooks correctly rejects invoking a hook
// from inside a callback). GenericAttachmentView below is what actually calls useQuery,
// unconditionally, in its own body; attachmentUrlQueryKey supplies the per-feature cache key
// (mirrors useBlockerAttachmentUrl/useClarificationAttachmentUrl's own queryKey exactly, so
// caching behavior is unchanged) since the fetch function alone isn't a stable query key.
type FetchAttachmentUrl = (attachmentId: number) => Promise<string>;
type AttachmentUrlQueryKey = (attachmentId: number) => readonly unknown[];

function GenericAttachmentView({ attachment, fetchAttachmentUrl, attachmentUrlQueryKey }: {
  attachment: GenericThreadAttachment;
  fetchAttachmentUrl: FetchAttachmentUrl;
  attachmentUrlQueryKey: AttachmentUrlQueryKey;
}) {
  const { data: url, isPending } = useQuery({
    queryKey: attachmentUrlQueryKey(attachment.id),
    queryFn: () => fetchAttachmentUrl(attachment.id),
    staleTime: Infinity,
  });
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

function GenericConversationMessage({
  m, fetchAttachmentUrl, attachmentUrlQueryKey, currentUserId, onEdit, onDelete, locked,
}: {
  m: GenericThreadMessage;
  fetchAttachmentUrl: FetchAttachmentUrl;
  attachmentUrlQueryKey: AttachmentUrlQueryKey;
  /** Signed-in user's id — an action menu only ever shows Edit/Delete on that user's OWN
   *  messages, never the other side's, regardless of role. */
  currentUserId?: number;
  /** Omitted entirely for a read-only surface (e.g. PM's EOD Inbox view) — see ThreadView's
   *  `hideComposer`, which this mirrors: no edit/delete wiring at all, not just a disabled one. */
  onEdit?: (replyId: number, message: string) => Promise<unknown>;
  onDelete?: (replyId: number) => Promise<unknown>;
  /** Thread closed (blocker resolved / clarification resolved) — Edit/Delete drop out of the
   *  menu the same way the reply box itself locks, but Copy still works on closed history. */
  locked?: boolean;
}) {
  const isTeamLead = m.senderRole === 'TEAM_LEAD';
  const { date, time } = fmtDateTimeParts(m.createdAt);
  const { show: toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.message);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwn = currentUserId != null && m.senderId === currentUserId;
  const canManage = isOwn && !locked;

  function copyMessage() {
    navigator.clipboard.writeText(m.message)
      .then(() => toast('Message copied to clipboard', 'success'))
      .catch(() => toast('Could not copy message', 'error'));
  }

  function startEdit() {
    setEditText(m.message);
    setEditing(true);
  }

  async function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || !onEdit) return;
    setSaving(true);
    try {
      await onEdit(m.id, trimmed);
      setEditing(false);
    } catch {
      toast('Failed to save changes. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(m.id);
      setConfirmingDelete(false);
    } catch {
      toast('Failed to delete message. Please try again.', 'error');
      setDeleting(false);
    }
  }

  const menuItems: DropdownMenuItem[] = [
    // Nothing to copy off an attachment-only reply (empty text) — Copy and Edit both gate on
    // m.message for the same reason.
    ...(m.message ? [{ key: 'copy', label: 'Copy', icon: Copy, onSelect: copyMessage }] : []),
    ...(canManage && onEdit && m.message ? [{ key: 'edit', label: 'Edit', icon: Pencil, onSelect: startEdit }] : []),
    ...(canManage && onDelete ? [{ key: 'delete', label: 'Delete', icon: Trash2, color: 'var(--risk)', onSelect: () => setConfirmingDelete(true) }] : []),
  ];

  return (
    // Spacing here (gap/margins/avatar size/bubble padding) trimmed slightly from the original —
    // each message this shaves a few px off directly buys back room for more of the thread to be
    // visible at once above the reply box, without needing to scroll immediately.
    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
      <Avatar name={m.senderName} bg={isTeamLead ? TL_AVATAR_BG : avatarColor(m.senderName)} size={24} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>
            {m.senderName} <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}>({isTeamLead ? 'Team Lead' : 'Employee'})</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{date} {time}</span>
          <div style={{ marginLeft: 'auto' }}>
            {menuItems.length > 0 && (
              <DropdownMenu items={menuItems} ariaLabel={`Actions for ${m.senderName}'s message`} />
            )}
          </div>
        </div>
        {editing ? (
          <div style={{ marginBottom: m.attachments.length ? 6 : 0 }}>
            <textarea
              autoFocus
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={2}
              style={{
                width: '100%', resize: 'none', padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
                background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                fontFamily: 'inherit', boxSizing: 'border-box', display: 'block', marginBottom: 6,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || !editText.trim()}
                style={{
                  padding: '5px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 6,
                  background: 'var(--risk)', border: '1px solid var(--risk)', color: '#fff',
                  cursor: saving || !editText.trim() ? 'default' : 'pointer', opacity: saving || !editText.trim() ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                style={{
                  padding: '5px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 6,
                  background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          m.message && (
            <div style={{
              fontSize: 12.5, color: 'var(--txt-mut)', lineHeight: 1.4, padding: '6px 10px', borderRadius: 8,
              background: isTeamLead ? 'color-mix(in srgb, var(--ok) 8%, transparent)' : 'var(--raised2)',
              border: `1px solid ${isTeamLead ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : 'var(--line2)'}`,
              marginBottom: m.attachments.length ? 6 : 0,
            }}>
              {m.message}
            </div>
          )
        )}
        {m.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {m.attachments.map(a => <GenericAttachmentView key={a.id} attachment={a} fetchAttachmentUrl={fetchAttachmentUrl} attachmentUrlQueryKey={attachmentUrlQueryKey} />)}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        title="Delete message"
        message="Delete this message? This cannot be undone."
        confirmLabel="Delete"
        isPending={deleting}
      />
    </div>
  );
}

/**
 * Generic conversation UI — message list + attachments/emoji/@mention compose box + locked
 * state — with no data-fetching of its own. `messages`/`onSend`/`fetchAttachmentUrl` are
 * supplied by a thin per-feature adapter (BlockerThreadView below, ClarificationThreadView in
 * ClarificationThread.tsx) so both features get byte-identical compose UI without either
 * forking a copy of it.
 */
export function ThreadView({
  messages, isPending, replyToLabel, visibilityNote, isLocked, lockedMessage,
  onSend, isSending, fetchAttachmentUrl, attachmentUrlQueryKey,
  maxAttachmentsPerReply = MAX_ATTACHMENTS_PER_REPLY, hideComposer,
  currentUserId, onEditMessage, onDeleteMessage,
}: {
  messages: GenericThreadMessage[] | undefined;
  isPending: boolean;
  replyToLabel: string;
  visibilityNote: string;
  isLocked?: boolean;
  /** e.g. "This blocker has been marked resolved. Reply is disabled." — the one piece of copy
   *  that differs per feature. */
  lockedMessage: string;
  onSend: (message: string, files: File[]) => Promise<unknown>;
  isSending: boolean;
  fetchAttachmentUrl: FetchAttachmentUrl;
  attachmentUrlQueryKey: AttachmentUrlQueryKey;
  maxAttachmentsPerReply?: number;
  /** Message list only, no reply box / locked banner / visibility note at all — for a surface
   *  that isn't part of the conversation on either side (e.g. PM's read-only EOD Inbox view,
   *  which already shows its own "view only" notice elsewhere in the panel). */
  hideComposer?: boolean;
  /** Signed-in user's id, and the edit/delete mutations — all three omitted together on a
   *  read-only surface (mirrors hideComposer), which drops Edit/Delete from every message's
   *  menu app-wide without a separate readOnly flag to thread through. */
  currentUserId?: number;
  onEditMessage?: (replyId: number, message: string) => Promise<unknown>;
  onDeleteMessage?: (replyId: number) => Promise<unknown>;
}) {
  const { show: toast } = useToast();
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  // Tracks the message count already scrolled to, so this only fires on a genuine change (the
  // panel's first load, or a new reply landing) — not on every unrelated re-render.
  const scrolledCountRef = useRef(0);

  // Auto-scroll to the newest message: on first open (0 → N) and whenever a reply is sent or
  // received (N → N+1). Jumps straight there rather than animating — this is a "where the
  // conversation already is", not a moment worth drawing attention to with a scroll animation.
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > 0 && count !== scrolledCountRef.current) {
      const el = messageListRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    scrolledCountRef.current = count;
  }, [messages]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
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

  // A reply needs a message OR at least one attachment — not necessarily both (mirrors the
  // relaxed server-side check in BlockerConversationService.saveReply).
  const canSend = draft.trim().length > 0 || pendingFiles.length > 0;

  async function handleSend() {
    if (isLocked || !canSend) return;
    setSendError(null);
    try {
      await onSend(draft.trim(), pendingFiles);
      // Only clear the compose box once the server has actually accepted the reply — clearing
      // unconditionally right after firing the request used to silently discard the draft and
      // attachments on any failure (network error, validation rejection, etc.) with no way to
      // recover them and no indication anything went wrong.
      setDraft('');
      setPendingFiles([]);
    } catch (err) {
      const msg = extractError(err);
      setSendError(msg);
      toast(msg, 'error');
    }
  }

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    // Same shared validateAttachmentFile used by SubmitEOD.tsx — type, then size, then count
    // against the running total (existing pending files plus whatever's already been accepted
    // from this same batch), so a multi-file pick that would push past the per-reply cap is
    // caught the same way a single over-cap pick already is.
    const accepted: File[] = [];
    let error: string | null = null;
    for (const file of picked) {
      const err = validateAttachmentFile(file, pendingFiles.length + accepted.length, maxAttachmentsPerReply);
      if (err) { error = err; break; }
      accepted.push(file);
    }
    if (error) {
      setAttachError(error);
      return;
    }
    setAttachError(null);
    setPendingFiles([...pendingFiles, ...accepted]);
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
    // `flex: 1` (filling whatever height the flex-column parent gives this), NOT `height: '100%'`:
    // a percentage height only resolves against a parent whose OWN height is "definite" per spec,
    // and a flex item's height coming from the flex algorithm doesn't reliably count as definite
    // for a plain block child's `height: 100%` — in practice this measured as the full unclamped
    // content height, defeating the internal scroll below and pushing the reply box out of view.
    // `flex: 1` sidesteps the percentage-resolution question entirely (this only works because
    // the immediate parent is itself `display: flex` — see the two call sites in Blockers.tsx /
    // MyBlockers.tsx).
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div ref={messageListRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {isPending ? (
          <GlobalLoader fullScreen={false} compact label="Loading conversation..." />
        ) : (messages ?? []).length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>No messages yet.</div>
        ) : (
          (messages ?? []).map(m => (
            <GenericConversationMessage
              key={m.id} m={m} fetchAttachmentUrl={fetchAttachmentUrl} attachmentUrlQueryKey={attachmentUrlQueryKey}
              currentUserId={currentUserId} onEdit={onEditMessage} onDelete={onDeleteMessage} locked={isLocked}
            />
          ))
        )}
      </div>

      {!hideComposer && (
      <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)', marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 600, marginBottom: 8 }}>
          {replyToLabel}
        </div>
        {isLocked ? (
          <div style={{
            padding: '12px 14px', borderRadius: 8, fontSize: 12.5, color: 'var(--txt-mut)',
            background: 'var(--raised2)', border: '1px solid var(--line2)',
          }}>
            {lockedMessage}
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
        {sendError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--risk)', marginBottom: 6,
          }}>
            <AlertCircle size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
            {sendError}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSendError(null); }}
          placeholder="Type your message..."
          // Was rows={3} — that alone, plus this box's own padding/margins, left room for barely
          // one message above it before this fix. 2 rows is still comfortable to type a couple of
          // sentences into; anyone drafting more can already see and scroll what they've written
          // (native textarea scrolling, unaffected by resize:none below).
          rows={2}
          style={{
            width: '100%', resize: 'none', padding: '8px 12px', borderRadius: '8px 8px 0 0', fontSize: 12.5,
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
              accept={ATTACHMENT_ACCEPT}
              onChange={handleFilesSelected}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              title={`Attach a file (${ALLOWED_ATTACHMENT_TYPES_LABEL} — up to ${maxAttachmentsPerReply}, ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB each)`}
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
            disabled={!canSend || isSending}
            style={{
              padding: '8px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 8,
              background: 'var(--risk)', border: '1px solid var(--risk)', color: '#fff',
              cursor: !canSend ? 'default' : 'pointer', opacity: !canSend ? 0.6 : 1,
            }}
          >
            {isSending ? 'Sending…' : 'Send Reply'}
          </button>
        </div>
        </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-dim)', marginTop: 10 }}>
          <Eye size={12} aria-hidden="true" /> {visibilityNote}
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Shared conversation UI for a single blocker's thread — used by both the Team Lead's
 * Blockers detail panel and the employee's blocker view, so the two sides look and behave
 * identically. `scope` picks the access-controlled route; the thread itself is one shared
 * row set (see BlockerConversationService on the backend), not a per-side copy.
 *
 * Thin adapter over the generic ThreadView above — this is what actually fetches/sends for
 * Blockers specifically.
 */
export function BlockerThreadView({ taskId, scope, replyToLabel, visibilityNote, range, isLocked }: {
  taskId: number;
  scope: ConversationScope;
  replyToLabel: string;
  visibilityNote: string;
  range?: DateRange;
  isLocked?: boolean;
}) {
  const { user } = useAuth();
  const { data: messages, isPending } = useBlockerThread(taskId, scope);
  const sendReply = useSendBlockerReply(taskId, scope, range);
  const editReply = useEditBlockerReply(taskId, scope);
  const deleteReply = useDeleteBlockerReply(taskId, scope);
  return (
    <ThreadView
      messages={messages}
      isPending={isPending}
      replyToLabel={replyToLabel}
      visibilityNote={visibilityNote}
      isLocked={isLocked}
      lockedMessage="This blocker has been marked resolved. Reply is disabled."
      onSend={(message, files) => sendReply.mutateAsync({ message, files })}
      isSending={sendReply.isPending}
      fetchAttachmentUrl={id => fetchBlockerAttachmentUrl(scope, id)}
      attachmentUrlQueryKey={id => ['blocker-attachment-blob', scope, id]}
      currentUserId={user?.id}
      onEditMessage={(replyId, message) => editReply.mutateAsync({ replyId, message })}
      onDeleteMessage={replyId => deleteReply.mutateAsync(replyId)}
    />
  );
}
