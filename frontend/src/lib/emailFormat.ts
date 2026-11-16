/**
 * Email shape check for the reset forms. Mirrors the backend's ForgotPasswordRequest pattern
 * (`^[^@\s]+@[^@\s]+\.[^@\s]+$`, max 200) — keep the two in step. It is a format check only: whether the
 * address is registered is never revealed to the browser.
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 200 && EMAIL_SHAPE.test(v);
}
