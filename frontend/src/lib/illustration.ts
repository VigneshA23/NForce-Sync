/**
 * Maps a profile's free-text `gender` field to one of the 3 hero-banner illustration variants.
 * Deliberately explicit-field-only: never infers gender from name/email/username. Anything
 * other than an exact "female"/"male" match — missing, loading, "Non-binary", "Prefer not to
 * say", or any unrecognized value — falls back to the neutral illustration so the dashboard
 * can never break or show a wrong assumption because of this field.
 */
export type IllustrationKey = 'female' | 'male' | 'neutral';

export function resolveIllustrationKey(gender: string | null | undefined): IllustrationKey {
  const normalized = gender?.trim().toLowerCase();
  if (normalized === 'female') return 'female';
  if (normalized === 'male') return 'male';
  return 'neutral';
}
