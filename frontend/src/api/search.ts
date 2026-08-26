import { api } from './client';

export interface UserResult {
  id: number;
  fullName: string;
  email: string;
  role: string;
  employeeCode: string;
}

export interface ProjectResult {
  id: number;
  code: string;
  name: string;
  status: string;
}

export interface SearchResultDto {
  users: UserResult[];
  projects: ProjectResult[];
}

export async function globalSearch(q: string): Promise<SearchResultDto> {
  const res = await api.get<SearchResultDto>('/search', { params: { q } });
  return res.data;
}
