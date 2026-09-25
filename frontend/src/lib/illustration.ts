/**
 * Maps a profile's free-text `gender` field to one of the 3 hero-banner illustration variants.
 * Deliberately explicit-field-only: never infers gender from name/email/username. Anything
 * other than an exact "female"/"male" match — missing, loading, "Non-binary", "Prefer not to
 * say", or any unrecognized value — falls back to the neutral illustration so the dashboard
 * can never break or show a wrong assumption because of this field.
 */
export type IllustrationKey = 'female' | 'male' | 'neutral';

/** Canonical gender options offered by every "Select Gender" control in the app (Profile, Add
 *  User) — kept in one place so a value typed here is guaranteed to be one resolveIllustrationKey
 *  actually recognizes, rather than two option lists silently drifting apart. */
export const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

export function resolveIllustrationKey(gender: string | null | undefined): IllustrationKey {
  const normalized = gender?.trim().toLowerCase();
  if (normalized === 'female') return 'female';
  if (normalized === 'male') return 'male';
  return 'neutral';
}
