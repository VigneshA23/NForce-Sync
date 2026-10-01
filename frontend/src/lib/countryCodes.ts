// ── Country dial codes ───────────────────────────────────────────────────────
// Used by Profile's Primary/Emergency phone fields to pair a national number (validated
// separately as exactly 10 digits) with an explicit country code, so the same 10-digit local
// number can't be misread as belonging to the wrong country. One entry per dial code — a few
// codes (e.g. +1, +7) are shared by several countries; we only need *a* correct code to store,
// not every country that happens to share it, so the list stays short and unambiguous.

export interface CountryCode {
  /** ISO 3166-1 alpha-2 — also what flagEmoji() converts into a flag glyph. */
  iso2: string;
  name: string;
  /** E.164 calling code, always "+" prefixed. */
  dialCode: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { iso2: 'AU', name: 'Australia',            dialCode: '+61' },
  { iso2: 'BD', name: 'Bangladesh',            dialCode: '+880' },
  { iso2: 'BE', name: 'Belgium',               dialCode: '+32' },
  { iso2: 'BR', name: 'Brazil',                dialCode: '+55' },
  { iso2: 'CA', name: 'Canada',                dialCode: '+1' },
  { iso2: 'CN', name: 'China',                 dialCode: '+86' },
  { iso2: 'EG', name: 'Egypt',                 dialCode: '+20' },
  { iso2: 'FR', name: 'France',                dialCode: '+33' },
  { iso2: 'DE', name: 'Germany',               dialCode: '+49' },
  { iso2: 'HK', name: 'Hong Kong',             dialCode: '+852' },
  { iso2: 'IN', name: 'India',                 dialCode: '+91' },
  { iso2: 'ID', name: 'Indonesia',              dialCode: '+62' },
  { iso2: 'IE', name: 'Ireland',               dialCode: '+353' },
  { iso2: 'IL', name: 'Israel',                dialCode: '+972' },
  { iso2: 'IT', name: 'Italy',                 dialCode: '+39' },
  { iso2: 'JP', name: 'Japan',                 dialCode: '+81' },
  { iso2: 'KE', name: 'Kenya',                 dialCode: '+254' },
  { iso2: 'MY', name: 'Malaysia',              dialCode: '+60' },
  { iso2: 'MX', name: 'Mexico',                dialCode: '+52' },
  { iso2: 'NL', name: 'Netherlands',           dialCode: '+31' },
  { iso2: 'NZ', name: 'New Zealand',           dialCode: '+64' },
  { iso2: 'NG', name: 'Nigeria',               dialCode: '+234' },
  { iso2: 'NO', name: 'Norway',                dialCode: '+47' },
  { iso2: 'PK', name: 'Pakistan',              dialCode: '+92' },
  { iso2: 'PH', name: 'Philippines',           dialCode: '+63' },
  { iso2: 'PL', name: 'Poland',                dialCode: '+48' },
  { iso2: 'RU', name: 'Russia',                dialCode: '+7' },
  { iso2: 'SA', name: 'Saudi Arabia',          dialCode: '+966' },
  { iso2: 'SG', name: 'Singapore',             dialCode: '+65' },
  { iso2: 'ZA', name: 'South Africa',          dialCode: '+27' },
  { iso2: 'KR', name: 'South Korea',           dialCode: '+82' },
  { iso2: 'ES', name: 'Spain',                 dialCode: '+34' },
  { iso2: 'LK', name: 'Sri Lanka',             dialCode: '+94' },
  { iso2: 'SE', name: 'Sweden',                dialCode: '+46' },
  { iso2: 'CH', name: 'Switzerland',           dialCode: '+41' },
  { iso2: 'TH', name: 'Thailand',              dialCode: '+66' },
  { iso2: 'AE', name: 'United Arab Emirates',  dialCode: '+971' },
  { iso2: 'GB', name: 'United Kingdom',        dialCode: '+44' },
  { iso2: 'US', name: 'United States',         dialCode: '+1' },
  { iso2: 'VN', name: 'Vietnam',               dialCode: '+84' },
].sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_DIAL_CODE = '+91';

/** Converts a 2-letter ISO country code into its flag emoji (each letter maps to a Unicode
 *  Regional Indicator Symbol; rendering support varies by OS/font, but it degrades gracefully
 *  to the plain letters on platforms that don't compose them into a flag glyph). */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/** Best-effort default dial code from a free-text location name (Sync's location records are
 *  just a name — see OrgLocationDto — with no structured country field). Matches this org's
 *  actual location data (e.g. "Albany, NY (HQ)", "Remote - US", "Bengaluru, India") plus a few
 *  bare Indian city names from the original seed data; anything unrecognized falls back to
 *  DEFAULT_DIAL_CODE rather than guessing further. */
export function defaultDialCodeForLocation(locationName: string | null | undefined): string {
  const loc = (locationName ?? '').toLowerCase();
  if (/\b(us|usa|united states)\b/.test(loc) || /\bny\b/.test(loc)) return '+1';
  if (/\buk\b|united kingdom/.test(loc)) return '+44';
  return DEFAULT_DIAL_CODE;
}
