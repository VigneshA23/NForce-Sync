import { api } from './client';

export interface TaskCategoryRef {
  id: number;
  name: string;
  isProductive: boolean;
  isBillableDefault: boolean;
}

export async function listTaskCategories(): Promise<TaskCategoryRef[]> {
  const res = await api.get<TaskCategoryRef[]>('/task-categories');
  return res.data;
}
