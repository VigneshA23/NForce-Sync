import { describe, it, expect } from 'vitest';
import {
  assistantReducer,
  canSend,
  initialAssistantState,
  secondsUntil,
  type AssistantState,
} from './assistantState';
import type { AssistantResponse } from '../../api/aiAssistant';

describe('assistantReducer', () => {
  it('ASK appends a pending user message and sets status to sending', () => {
    const state = assistantReducer(initialAssistantState, { type: 'ASK', tempId: 't1', message: 'hello' });
    expect(state.status).toBe('sending');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ sender: 'USER', content: 'hello' });
  });

  it('ANSWER appends the assistant message and adopts the server conversationId', () => {
    const afterAsk = assistantReducer(initialAssistantState, { type: 'ASK', tempId: 't1', message: 'hi' });
    const response: AssistantResponse = {
      type: 'HOW_TO',
      answer: 'Open Submit EOD.',
      steps: ['Step 1'],
      navigation: { pageId: 'eod-submit', label: 'Submit EOD' },
      related: [],
      confidence: 'HIGH',
      conversationId: 'conv-1',
      messageId: 42,
    };
    const state = assistantReducer(afterAsk, { type: 'ANSWER', tempId: 't1', response });

    expect(state.status).toBe('idle');
    expect(state.conversationId).toBe('conv-1');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ id: '42', sender: 'ASSISTANT', content: 'Open Submit EOD.' });
  });

  it('FAIL keeps the sent user message but surfaces an error', () => {
    const afterAsk = assistantReducer(initialAssistantState, { type: 'ASK', tempId: 't1', message: 'hi' });
    const state = assistantReducer(afterAsk, { type: 'FAIL', tempId: 't1', message: 'network error' });
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('network error');
    expect(state.messages).toHaveLength(1); // the user's question is not erased
  });

  it('RATE_LIMITED records the retry time', () => {
    const retryAt = new Date(Date.now() + 30_000);
    const state = assistantReducer(initialAssistantState, {
      type: 'RATE_LIMITED', tempId: 't1', retryAt, message: 'slow down',
    });
    expect(state.status).toBe('rate-limited');
    expect(state.rateLimitRetryAt).toBe(retryAt);
  });

  it('CLEAR empties messages but keeps the conversationId', () => {
    const withConvo: AssistantState = { ...initialAssistantState, conversationId: 'conv-1', messages: [
      { id: '1', sender: 'USER', content: 'hi' },
    ] };
    const state = assistantReducer(withConvo, { type: 'CLEAR' });
    expect(state.messages).toHaveLength(0);
    expect(state.conversationId).toBe('conv-1');
  });

  it('RESTORE maps transcript rows in order', () => {
    const state = assistantReducer(initialAssistantState, {
      type: 'RESTORE',
      conversationId: 'conv-1',
      messages: [
        { id: 1, sender: 'USER', content: 'q1', responseType: null, createdAt: '2026-01-01T00:00:00Z' },
        { id: 2, sender: 'ASSISTANT', content: 'a1', responseType: 'HOW_TO', createdAt: '2026-01-01T00:00:01Z' },
      ],
    });
    expect(state.conversationId).toBe('conv-1');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].sender).toBe('USER');
    expect(state.messages[1].responseType).toBe('HOW_TO');
  });

  it('FEEDBACK tags the matching message only', () => {
    const withMessages: AssistantState = {
      ...initialAssistantState,
      messages: [
        { id: '1', sender: 'ASSISTANT', content: 'a' },
        { id: '2', sender: 'ASSISTANT', content: 'b' },
      ],
    };
    const state = assistantReducer(withMessages, { type: 'FEEDBACK', messageId: '2', rating: 'DOWN' });
    expect(state.messages[0].feedback).toBeUndefined();
    expect(state.messages[1].feedback).toBe('DOWN');
  });
});

describe('canSend', () => {
  it('rejects empty or whitespace-only text', () => {
    expect(canSend(initialAssistantState, '', 1000)).toBe(false);
    expect(canSend(initialAssistantState, '   ', 1000)).toBe(false);
  });

  it('rejects text over the max length', () => {
    expect(canSend(initialAssistantState, 'x'.repeat(1001), 1000)).toBe(false);
    expect(canSend(initialAssistantState, 'x'.repeat(1000), 1000)).toBe(true);
  });

  it('rejects while a send is already in flight', () => {
    const sending: AssistantState = { ...initialAssistantState, status: 'sending' };
    expect(canSend(sending, 'hello', 1000)).toBe(false);
  });

  it('rejects while rate-limited and the retry time has not passed', () => {
    const limited: AssistantState = {
      ...initialAssistantState, status: 'rate-limited', rateLimitRetryAt: new Date(Date.now() + 10_000),
    };
    expect(canSend(limited, 'hello', 1000)).toBe(false);
  });

  it('allows sending once the rate-limit retry time has passed', () => {
    const limited: AssistantState = {
      ...initialAssistantState, status: 'rate-limited', rateLimitRetryAt: new Date(Date.now() - 1000),
    };
    expect(canSend(limited, 'hello', 1000)).toBe(true);
  });
});

describe('secondsUntil', () => {
  it('never goes negative', () => {
    expect(secondsUntil(new Date(Date.now() - 5000))).toBe(0);
  });

  it('rounds up to the nearest second', () => {
    const target = new Date(Date.now() + 1500);
    expect(secondsUntil(target)).toBe(2);
  });
});
