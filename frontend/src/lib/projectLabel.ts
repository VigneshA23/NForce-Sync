/**
 * The one display label for a project, "CODE — Name" (mirrors ProjectLabel.java, which the member rows are built with),
 * so a Project filter option and the rows it filters match by plain string equality.
 */
export function projectLabel(project: { code?: string | null; name?: string | null }): string {
  const code = project.code?.trim();
  const name = project.name?.trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || '';
}

/** Project filter options from the projects a lead leads: one "CODE — Name" label each, no repeats, A to Z. */
export function ledProjectOptions(projects: ReadonlyArray<{ code?: string | null; name?: string | null }> | undefined): string[] {
  const labels = (projects ?? []).map(projectLabel).filter(label => label !== '');
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}
