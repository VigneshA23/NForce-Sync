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

// Auth failures used to be invisible: a rejected query just left React Query on its `[]`
// fallback, so a 403'd screen rendered as "no data" instead of an error. Route the two
// cases the user can act on, and let everything else reject so the caller can surface it.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.error;

    // JwtFilter blocks every endpoint but /auth/change-password while the temp-password
    // flag is set. Send the user to the screen that can actually clear it.
    if (
      status === 403 &&
      typeof message === "string" &&
      message.toLowerCase().includes("password change required") &&
      window.location.pathname !== "/force-change-password"
    ) {
      window.location.assign("/force-change-password");
    }

    // Expired or invalid token — drop the stale session and re-authenticate.
    if (status === 401) {
      // A 401 from the login call itself is "wrong password", not a dead session:
      // Login.tsx owns that message and must not be reloaded out from under it.
      const isLoginAttempt = (error?.config?.url ?? "").includes("/auth/login");

      if (!isLoginAttempt) {
        // Cleared unconditionally, and deliberately OUTSIDE the redirect guard below.
        // Leaving a dead session behind while still navigating to /login lets
        // RedirectAuth bounce straight back to the role landing page, which 401s
        // again — a hard-reload loop with no exit.
        try {
          localStorage.removeItem("nfsync_session");
        } catch {
          // Storage unavailable (private mode, blocked cookies). Nothing more to do —
          // the redirect still gets the user to a screen where they can sign in.
        }

        // Pre-auth screens own their own error state; don't navigate out of them.
        const PRE_AUTH_PATHS = ["/login", "/forgot", "/reset"];
        if (!PRE_AUTH_PATHS.includes(window.location.pathname)) {
          window.location.assign("/login");
        }
      }
    }

    return Promise.reject(error);
  },
);
