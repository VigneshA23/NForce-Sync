/**
 * The server's message for a failed request. The backend's GlobalExceptionHandler returns
 * `{ "error": "<reason>" }` for every ResponseStatusException, so a 403/409 carries the specific
 * reason (e.g. "This entry has an open clarification and cannot be approved or rejected until it
 * is resolved") rather than a bare status text. Re-exported from pages/approvals/shared.tsx for
 * its existing importers.
 */
export function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Something went wrong';
}
