// Capitalizes only the first character, leaving the rest of the string untouched
// so it's safe to call on every keystroke without fighting manual casing edits
// past the first character or causing cursor-jump bugs.
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
