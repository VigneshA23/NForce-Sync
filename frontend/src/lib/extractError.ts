/**
 * The server's message for a failed request. The backend's GlobalExceptionHandler returns
 * `{ "error": "<reason>" }` for every ResponseStatusException, so a 403/409 carries the specific
 * reason (e.g. "This entry has an open clarification and cannot be approved or rejected until it
 * is resolved") rather than a bare status text. Re-exported from pages/approvals/shared.tsx for
 * its existing importers.
 *
 * Bean-validation failures arrive as `{ "error": "Validation failed", "fields": { "<path>": "<msg>" } }`.
 * The generic "Validation failed" hides the real reason, so when `fields` is present its messages are shown
 * instead; an indexed path such as `logLines[1].description` is prefixed "Row 2: ".
 */
export function extractError(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: string; message?: string; fields?: Record<string, string> } };
  };
  const data = e?.response?.data;
  const fields = formatFieldErrors(data?.fields);
  if (fields) return fields;
  return data?.error ?? data?.message ?? 'Something went wrong';
}

/** "Row 2: Description must be 3–4000 characters", several joined with "; ". Null when there is nothing to show. */
export function formatFieldErrors(fields: Record<string, string> | undefined | null): string | null {
  if (!fields || typeof fields !== 'object') return null;
  const parts = Object.entries(fields)
    .filter(([, msg]) => typeof msg === 'string' && msg.trim() !== '')
    .map(([path, msg]) => {
      const row = /\[(\d+)\]/.exec(path);
      return { index: row ? Number(row[1]) : -1, text: row ? `Row ${Number(row[1]) + 1}: ${msg}` : msg };
    })
    .sort((a, b) => a.index - b.index)
    .map(p => p.text);
  return parts.length ? parts.join('; ') : null;
}

/**
 * The id of the Daily Log line a "cannot be removed — it has a blocker conversation" 409 is about, or null for any
 * other error. The server adds {@code lineId} to that one response so the form can show the message next to the line.
 */
export function lockedLineIdOf(err: unknown): number | null {
  const e = err as { response?: { status?: number; data?: { lineId?: number } } };
  const id = e?.response?.data?.lineId;
  return e?.response?.status === 409 && typeof id === 'number' ? id : null;
}
