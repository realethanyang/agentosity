"use client";

export type AuthState = { email: string; token: string; refresh?: string };

export function authState(): AuthState | null {
  try {
    const raw = localStorage.getItem("xbb_auth");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(a: AuthState) {
  localStorage.setItem("xbb_auth", JSON.stringify(a));
}

export function clearAuth() {
  localStorage.removeItem("xbb_auth");
}

function jwtExpMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/** @deprecated 优先用 freshAuthHeaders(会自动续期) */
export function authHeaders(): Record<string, string> {
  const a = authState();
  return a ? { Authorization: `Bearer ${a.token}` } : {};
}

/** 带自动续期的登录头:access token 快过期时用 refresh token 换新 */
export async function freshAuthHeaders(): Promise<Record<string, string>> {
  const a = authState();
  if (!a) return {};
  if (jwtExpMs(a.token) - Date.now() > 5 * 60 * 1000) {
    return { Authorization: `Bearer ${a.token}` };
  }
  if (!a.refresh) {
    clearAuth();
    return {};
  }
  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: a.refresh }),
    });
    const d = await r.json();
    if (d.ok) {
      saveAuth({ email: d.email ?? a.email, token: d.access_token, refresh: d.refresh_token });
      return { Authorization: `Bearer ${d.access_token}` };
    }
  } catch {
    /* 网络失败:降级为匿名 */
  }
  clearAuth();
  return {};
}
