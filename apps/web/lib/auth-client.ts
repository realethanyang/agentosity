"use client";

export type AuthState = { email: string; token: string };

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

export function authHeaders(): Record<string, string> {
  const a = authState();
  return a ? { Authorization: `Bearer ${a.token}` } : {};
}
