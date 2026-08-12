import { useQuery } from "@tanstack/react-query";
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

/**
 * Live unread-notification count, sharing one query cache entry (same queryKey)
 * across every consumer — topbar bell, sidebar nav badge, and the Notifications
 * page header all read this so they can never disagree. Any mutation that
 * invalidates the `['notifications']` key (mark read / mark all read) or the
 * background poll below refreshes all of them at once.
 */
export function useUnreadNotificationsCount() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 15_000,
    // staleTime: 0 so tabbing back to the app (refetchOnWindowFocus) always hits the
    // network instead of serving a cached count from before a TL resolved/replied —
    // that gap was why the bell badge needed a hard page refresh to update.
    staleTime: 0,
  });
  return data ?? 0;
}
