import { api } from './client';

export interface TaskCategoryRef {
  id: number;
  name: string;
  isProductive: boolean;
  isBillableDefault: boolean;
}

// The backend (task_category_normalized_name_uq, see V60) and TaskCategoryController already
// guarantee a globally unique, deduplicated list — this is a defensive safeguard only, not a
// substitute for that. Dedupes by normalized name (trim + lowercase) so distinct categories that
// merely share casing/whitespace collapse, while genuinely different names (e.g. "Code Review"
// vs "Code Review - Technical") are never conflated.
function dedupeByNormalizedName(categories: TaskCategoryRef[]): TaskCategoryRef[] {
  const seen = new Set<string>();
  return categories.filter(c => {
    const key = c.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listTaskCategories(): Promise<TaskCategoryRef[]> {
  const res = await api.get<TaskCategoryRef[]>('/task-categories');
  return dedupeByNormalizedName(res.data);
}
