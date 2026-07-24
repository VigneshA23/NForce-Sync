import { api } from './client';

export interface ProjectRef {
  id: number;
  code: string;
  name: string;
  client: string | null;
}

export async function listProjects(): Promise<ProjectRef[]> {
  const res = await api.get<ProjectRef[]>('/projects');
  return res.data;
}
