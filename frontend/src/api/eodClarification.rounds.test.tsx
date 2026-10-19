// @vitest-environment jsdom
/**
 * One EOD can have a clarification round per project, so every status / thread / mark-read call is keyed and
 * parameterised by the round (or piece) it is about. Opening card A's chat and then card B's must never show
 * A's data under B, and posting or marking read must name the right round.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const get = vi.fn();
const post = vi.fn();
vi.mock('./client', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import {
  useClarificationStatus, useClarificationStatusForApprovals, useClarificationThread, useMarkClarificationRead,
  useSendClarificationReply, type EodInboxItemDto,
} from './eodClarification';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// The server answers per round / piece, exactly as the real endpoints do.
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((url: string, config?: { params?: { clarificationId?: number; pieceId?: number } }) => {
    const p = config?.params ?? {};
    if (url.endsWith('/replies')) {
      return Promise.resolve({ data: [{ id: 1, message: `thread of round ${p.clarificationId ?? 'default'}` }] });
    }
    return Promise.resolve({ data: { clarificationId: p.clarificationId ?? p.pieceId ?? null, projectName: `P${p.clarificationId ?? p.pieceId}` } });
  });
  post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe('thread cache is keyed by round', () => {
  it('opening round A then round B fetches B afresh and never shows A under B', async () => {
    const qc = newClient();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useClarificationThread(100, 'employee', true, id),
      { wrapper: wrapper(qc), initialProps: { id: 7 } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.[0].message).toBe('thread of round 7');

    rerender({ id: 8 });
    // The moment B is selected there is no stale A data under it...
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.[0].message).toBe('thread of round 8');

    // ...and each round has its own request carrying its own id.
    const sent = get.mock.calls.map(c => (c[1] as { params?: { clarificationId?: number } }).params?.clarificationId);
    expect(sent).toEqual([7, 8]);
    // Going back to A serves A's own cache, not B's.
    rerender({ id: 7 });
    expect(result.current.data?.[0].message).toBe('thread of round 7');
  });
});

describe('status cache is keyed by round / piece', () => {
  it('employee status for round A and round B are separate entries', async () => {
    const qc = newClient();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useClarificationStatus(100, 'employee', true, id),
      { wrapper: wrapper(qc), initialProps: { id: 7 } },
    );
    await waitFor(() => expect(result.current.data?.projectName).toBe('P7'));
    rerender({ id: 8 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.projectName).toBe('P8'));
  });

  it("an Approvals card reads only its own piece's status (card A then card B)", async () => {
    const qc = newClient();
    const { result, rerender } = renderHook(
      ({ piece }: { piece: number }) => useClarificationStatusForApprovals(100, true, false, piece),
      { wrapper: wrapper(qc), initialProps: { piece: 1 } },
    );
    await waitFor(() => expect(result.current.data?.projectName).toBe('P1'));
    rerender({ piece: 2 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.projectName).toBe('P2'));
    expect(get.mock.calls.map(c => (c[1] as { params?: { pieceId?: number } }).params?.pieceId)).toEqual([1, 2]);
  });
});

describe('writes name their round', () => {
  it('a reply is posted with the chosen round id', async () => {
    const qc = newClient();
    const { result } = renderHook(() => useSendClarificationReply(100, 'employee', 8), { wrapper: wrapper(qc) });
    await act(async () => { await result.current.mutateAsync({ message: 'hi', files: [] }); });

    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('clarificationId')).toBe('8');
    expect(form.get('message')).toBe('hi');
  });

  it('marking one round read clears only that round\'s unread dot, and tells the server which round', async () => {
    const qc = newClient();
    const row = (clarificationId: number): EodInboxItemDto => ({ clarificationId, eodEntryId: 100, unread: true } as EodInboxItemDto);
    qc.setQueryData(['eod-inbox', 'employee', true], [row(7), row(8)]);
    const { result } = renderHook(() => useMarkClarificationRead('employee'), { wrapper: wrapper(qc) });

    await act(async () => { await result.current.mutateAsync({ entryId: 100, clarificationId: 7 }); });

    const rows = qc.getQueryData<EodInboxItemDto[]>(['eod-inbox', 'employee', true])!;
    expect(rows.find(r => r.clarificationId === 7)!.unread).toBe(false);
    expect(rows.find(r => r.clarificationId === 8)!.unread).toBe(true);
    expect(post.mock.calls[0][2]).toEqual({ params: { clarificationId: 7 } });
  });
});
