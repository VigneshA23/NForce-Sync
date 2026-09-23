// EOD Supporting Attachments — client-side validation shared by the EOD-level and every
// task-level attach control in SubmitEOD.tsx. Kept in sync with EodAttachmentValidation.java and
// application.yml's app.eod-attachment.* values on the backend, which is the real guarantee —
// this is just for immediate feedback before a doomed upload is attempted. Extracted to its own
// module (rather than living inline in SubmitEOD.tsx) so it's unit-testable the same way
// hoursBreakdown.ts is.

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ALLOWED_ATTACHMENT_TYPES_LABEL = 'PNG, JPG/JPEG, WEBP, PDF, DOC/DOCX, or XLS/XLSX';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ENTRY = 10;
export const MAX_ATTACHMENTS_PER_TASK = 5;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A tiny wrapper document for the tab a "View" click opens. Needed because navigating a tab
 * straight to the file leaves the browser's own (inconsistent, per file type) viewer in charge
 * of the tab title — usually the opaque URL itself, never the original filename. Staying on
 * this wrapper document instead means the <title> we set is the one the tab keeps, for every
 * content type, in every browser.
 *
 * `fileUrl` is expected to be a data: URL (see getEodAttachmentDataUrl) rather than a blob:
 * object URL — the latter only resolves inside the browsing context that minted it, which a
 * popup window is not guaranteed to share, and was the cause of the "View" tab rendering blank.
 *
 * Images and PDFs are previewed inline; anything else (doc/xls and friends, which no browser
 * renders natively) gets a plain download link — `download` there is what makes Save-As offer
 * the real filename instead of a random/hashed one.
 */
export function buildAttachmentViewerHtml(fileName: string, contentType: string, fileUrl: string): string {
  const safeName = escapeHtml(fileName);
  const body = contentType.startsWith('image/')
    ? `<img src="${fileUrl}" alt="${safeName}" />`
    : contentType === 'application/pdf'
      ? `<embed src="${fileUrl}" type="application/pdf" />`
      : `<a href="${fileUrl}" download="${safeName}">Download ${safeName}</a>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title>`
    + `<style>
         html,body{height:100%;margin:0;background:#1b1d22;}
         body{display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;}
         img{max-width:100%;max-height:100%;object-fit:contain;}
         embed{width:100%;height:100%;border:0;}
         a{color:#4C8DD6;}
       </style></head><body>${body}</body></html>`;
}

/** Loading placeholder shown in the "Preview" tab the instant it opens, before the file's bytes
 *  have been fetched — keeps the tab from ever sitting on a blank/about:blank-looking page while
 *  the network request is in flight. The title is set immediately since the filename is already
 *  known client-side without a round trip; only the body is replaced once the real content is
 *  ready (see previewEodAttachment). */
export function buildAttachmentLoadingHtml(fileName: string): string {
  const safeName = escapeHtml(fileName);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title>`
    + `<style>
         html,body{height:100%;margin:0;background:#1b1d22;}
         body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
              font:13px system-ui,sans-serif;color:#9BA1AC;}
         .nf-pv-spin{width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,255,255,.15);
              border-top-color:#4C8DD6;animation:nf-pv-spin .8s linear infinite;}
         @keyframes nf-pv-spin{to{transform:rotate(360deg);}}
       </style></head><body><div class="nf-pv-spin" aria-hidden="true"></div><div>Loading ${safeName}…</div></body></html>`;
}

/** Shown in the "Preview" tab in place of the loading state when the fetch fails, so the tab
 *  stays informative instead of silently reverting to a blank page with no explanation. */
export function buildAttachmentErrorHtml(fileName: string, message: string): string {
  const safeName = escapeHtml(fileName);
  const safeMessage = escapeHtml(message);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title>`
    + `<style>
         html,body{height:100%;margin:0;background:#1b1d22;}
         body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
              font:14px system-ui,sans-serif;color:#E4373D;text-align:center;padding:24px;box-sizing:border-box;}
       </style></head><body><div>Couldn't load ${safeName}</div>`
    + `<div style="color:#9BA1AC;font-size:12.5px;max-width:420px;">${safeMessage}</div></body></html>`;
}

/**
 * Opens a new tab for "Preview" and fills it in progressively — the window opens SYNCHRONOUSLY,
 * before `fetchDataUrl` even starts, so it stays attached to the click's user-gesture context
 * (calling `window.open()` only after an `await` is what most often gets a popup silently
 * blocked). It shows the loading state immediately — title already correct, since the filename
 * is known client-side — then swaps in the real content once `fetchDataUrl` resolves, or an
 * error state if it rejects. The tab is never blank at any point.
 *
 * `fetchDataUrl` must resolve to a `data:` URL, not a `blob:` object URL — a blob: URL only
 * resolves inside the browsing context that minted it via `URL.createObjectURL`, which a newly
 * opened tab is not guaranteed to share. That mismatch was the original cause of this exact bug:
 * a tab whose title showed the right filename but whose body never rendered anything.
 *
 * @param formatError turns a thrown/rejected value into the message shown in the tab's error
 *   state. Left to the caller (rather than done here) so each page can reuse its own
 *   axios-aware `extractError` instead of this module taking on that dependency.
 * @throws whatever `fetchDataUrl` rejected with (after painting the tab's error state), or a
 *   plain Error if the popup itself was blocked — callers still get to also toast/report it.
 */
export async function previewEodAttachment(
  attachment: { fileName: string; contentType: string },
  fetchDataUrl: () => Promise<string>,
  formatError: (err: unknown) => string = () => 'Something went wrong loading this file.',
): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
  }
  win.document.write(buildAttachmentLoadingHtml(attachment.fileName));
  win.document.close();
  try {
    const dataUrl = await fetchDataUrl();
    if (win.closed) return;
    win.document.open();
    win.document.write(buildAttachmentViewerHtml(attachment.fileName, attachment.contentType, dataUrl));
    win.document.close();
  } catch (err) {
    if (!win.closed) {
      win.document.open();
      win.document.write(buildAttachmentErrorHtml(attachment.fileName, formatError(err)));
      win.document.close();
    }
    throw err;
  }
}

export function fmtAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validates a picked file against the shared allowlist/size/count limits. Returns a user-facing
 * error message, or null if the file is valid to upload.
 */
export function validateAttachmentFile(
  file: { name: string; type: string; size: number },
  currentCount: number,
  maxCount: number,
): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported file type. Only ${ALLOWED_ATTACHMENT_TYPES_LABEL} files can be attached.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}" exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB attachment limit`;
  }
  if (currentCount >= maxCount) {
    return `You can attach up to ${maxCount} files here`;
  }
  return null;
}
