import { api as apiClient } from "./client";

export interface ProfileDto {
  id: number;
  fullName: string;
  email: string;
  role: string;
  employeeCode: string;
  status: string;
  managerId: number | null;
  managerName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  designationId: number | null;
  designationName: string | null;
  locationId: number | null;
  locationName: string | null;
  employmentType: string | null;
  workMode: string | null;
  joiningDate: string | null;
  createdAt: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface UpdateProfileRequest {
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export async function fetchProfile(): Promise<ProfileDto> {
  const { data } = await apiClient.get<ProfileDto>("/profile");
  return data;
}

export async function updateProfile(payload: UpdateProfileRequest): Promise<ProfileDto> {
  const { data } = await apiClient.patch<ProfileDto>("/profile", payload);
  return data;
}
