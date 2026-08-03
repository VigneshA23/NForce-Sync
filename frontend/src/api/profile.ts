import { api as apiClient } from "./client";

export interface ProfileDto {
  id: number;
  fullName: string;
  email: string;
  role: string;
  employeeCode: string;
  status: string;
  active: boolean;
  hasEmployeeRecord: boolean;
  // HR-controlled (read-only)
  managerId: number | null;
  managerName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  designationId: number | null;
  designationName: string | null;
  locationId: number | null;
  locationName: string | null;
  employmentType: string | null;
  joiningDate: string | null;
  createdAt: string;
  // Self-service (editable)
  workMode: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  personalEmail: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoDataUrl: string | null;
}

export interface UpdateProfilePayload {
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  workMode?: string;
  personalEmail?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
}

export async function fetchProfile(): Promise<ProfileDto> {
  const { data } = await apiClient.get<ProfileDto>("/profile");
  return data;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileDto> {
  const { data } = await apiClient.patch<ProfileDto>("/profile", payload);
  return data;
}

export async function uploadPhoto(file: File): Promise<ProfileDto> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<ProfileDto>("/profile/photo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
