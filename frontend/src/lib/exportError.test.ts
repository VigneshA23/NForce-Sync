import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_FAILED_MESSAGE, ExportError, exportErrorMessage, toExportError } from './exportError';

function axiosError(status: number | null, data?: unknown): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  if (status == null) return new AxiosError('Network Error', 'ERR_NETWORK', config);
  return new AxiosError('failed', 'ERR_BAD_RESPONSE', config, {}, {
    status, statusText: '', headers: {}, config, data,
  });
}

const blobOf = (text: string) => new Blob([text], { type: 'application/json' });

describe('toExportError', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleError.mockRestore(); });

  it('reads the message out of a JSON error delivered as a blob', async () => {
    const e = await toExportError(axiosError(400, blobOf('{"error":"Unsupported export format: DOCX"}')));
    expect(e).toBeInstanceOf(ExportError);
    expect(e.message).toBe('Unsupported export format: DOCX');
    expect(e.status).toBe(400);
  });

  it('accepts a "message" field too', async () => {
    expect((await toExportError(axiosError(500, blobOf('{"message":"Boom"}')))).message).toBe('Boom');
  });

  it('uses plain-text bodies as they are', async () => {
    expect((await toExportError(axiosError(502, blobOf('Bad gateway')))).message).toBe('Bad gateway');
  });

  it('falls back to the generic text for an empty body or an HTML error page', async () => {
    expect((await toExportError(axiosError(500, blobOf('')))).message).toBe(EXPORT_FAILED_MESSAGE);
    expect((await toExportError(axiosError(500, blobOf('<html>oops</html>')))).message).toBe(EXPORT_FAILED_MESSAGE);
  });

  it('reads an already-parsed JSON body (non-blob response)', async () => {
    expect((await toExportError(axiosError(403, { error: 'Forbidden' }))).message).toBe('Forbidden');
  });

  it('says the server is unreachable when there was no response at all', async () => {
    const e = await toExportError(axiosError(null));
    expect(e.message).toMatch(/could not reach the server/i);
    expect(e.status).toBeUndefined();
  });

  it('uses the generic text for an error that is not an HTTP failure', async () => {
    expect((await toExportError(new Error('x is not a function'))).message).toBe(EXPORT_FAILED_MESSAGE);
  });

  it('logs the real status and error to the console', async () => {
    const err = axiosError(500, blobOf('{"error":"Something went wrong."}'));
    await toExportError(err);
    expect(consoleError).toHaveBeenCalledWith('Report export failed',
      expect.objectContaining({ status: 500, body: '{"error":"Something went wrong."}', error: err }));
  });

  it('passes an ExportError straight through', async () => {
    const original = new ExportError('Already handled', 403);
    expect(await toExportError(original)).toBe(original);
  });
});

describe('exportErrorMessage', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("shows the server's reason for an ExportError", () => {
    expect(exportErrorMessage(new ExportError('Scope denied', 403))).toBe('Scope denied');
  });

  it('shows the generic text for anything else', () => {
    expect(exportErrorMessage(new Error('boom'))).toBe(EXPORT_FAILED_MESSAGE);
    expect(exportErrorMessage('nope')).toBe(EXPORT_FAILED_MESSAGE);
  });
});
