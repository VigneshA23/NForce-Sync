import axios from 'axios';

/** Shown only when the server gave us nothing better to say. */
export const EXPORT_FAILED_MESSAGE = 'Export failed. Please try again.';
const UNREACHABLE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/** A failed report export, with the server's own message and HTTP status when there was one. */
export class ExportError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ExportError';
    this.status = status;
  }
}

/** Blob.text() where it exists (every current browser, Node); FileReader for anything older. */
function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** The `error` / `message` of a JSON error body, or the plain text if it isn't JSON. Null if empty. */
function messageFromBody(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as { error?: unknown; message?: unknown };
      if (typeof body.error === 'string' && body.error.trim() !== '') return body.error;
      if (typeof body.message === 'string' && body.message.trim() !== '') return body.message;
      return null;
    }
  } catch {
    // Not JSON — fall through to the raw text, unless it's an HTML error page.
  }
  return trimmed.startsWith('<') ? null : trimmed.slice(0, 300);
}

/**
 * Turns whatever a blob download request threw into an ExportError carrying the server's message.
 *
 * With `responseType: 'blob'` an error response body arrives as a Blob too, so `error.response.data.error`
 * is undefined and the real reason was being thrown away. Read the blob as text and pull the message out.
 * The real status and error are logged to the console so a failure can be diagnosed from DevTools.
 */
export async function toExportError(err: unknown): Promise<ExportError> {
  if (err instanceof ExportError) return err;

  let status: number | undefined;
  let body: string | null = null;
  let message = EXPORT_FAILED_MESSAGE;

  if (axios.isAxiosError(err)) {
    status = err.response?.status;
    if (!err.response) {
      message = UNREACHABLE_MESSAGE;
    } else {
      const data: unknown = err.response.data;
      try {
        if (data instanceof Blob) body = await readBlobAsText(data);
        else if (typeof data === 'string') body = data;
        else if (data && typeof data === 'object') body = JSON.stringify(data);
      } catch {
        body = null;
      }
      message = (body != null ? messageFromBody(body) : null) ?? message;
    }
  }

  console.error('Report export failed', { status, body, error: err });
  return new ExportError(message, status);
}

/** The message for a toast: the server's reason for an ExportError, the generic text for anything else. */
export function exportErrorMessage(err: unknown): string {
  if (err instanceof ExportError) return err.message;
  console.error('Report export failed', err);
  return EXPORT_FAILED_MESSAGE;
}
