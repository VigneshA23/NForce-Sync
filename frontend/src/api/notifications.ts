import { api as apiClient } from "./client";

export interface NotificationDto {
  id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  content: NotificationDto[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export async function fetchNotifications(page = 0, size = 20): Promise<NotificationPage> {
  const { data } = await apiClient.get("/notifications", { params: { page, size } });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.patch("/notifications/read-all");
}
