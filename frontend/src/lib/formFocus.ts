import type { KeyboardEvent } from 'react';

const FOCUSABLE_SELECTOR = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

/**
 * Enter-key handler for form fields: moves focus to the next focusable element
 * in DOM/tab order instead of letting the browser's default "Enter submits the
 * form" behaviour fire. Attach to text-like inputs where Enter shouldn't submit;
 * leave the submit button itself unwired so Enter there still submits normally.
 */
export function focusNextOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter') return;
  const form = e.currentTarget.closest('form');
  if (!form) return;
  e.preventDefault();
  const focusable = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1);
  const next = focusable[focusable.indexOf(e.currentTarget) + 1];
  next?.focus();
}
