// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LinkExpiredCard } from './LinkExpired';

afterEach(cleanup);

describe('LinkExpiredCard', () => {
  it('shows the expired heading and the instruction text', () => {
    render(<LinkExpiredCard onRequestNew={() => {}} />);
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeTruthy();
    expect(screen.getByText('Your password reset link is no longer valid. Please request a new link.')).toBeTruthy();
  });

  it('"Request new link" hands control to the new-link flow', () => {
    const onRequestNew = vi.fn();
    render(<LinkExpiredCard onRequestNew={onRequestNew} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request new link' }));
    expect(onRequestNew).toHaveBeenCalledTimes(1);
  });
});
