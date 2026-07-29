import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem("nfsync_session");
    if (raw) {
      const session = JSON.parse(raw) as { token: string };
      if (session.token) config.headers.Authorization = `Bearer ${session.token}`;
    }
  } catch {}
  return config;
});
