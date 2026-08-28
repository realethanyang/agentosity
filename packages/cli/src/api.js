import { apiBase, loadConfig, saveConfig } from "./config.js";

function jwtExpMs(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp * 1000;
  } catch {
    return 0;
  }
}

let refreshing = null;

/** access token 快过期时用 refresh token 换新(轮换制);失败则清登录态 */
async function ensureFresh() {
  const cfg = loadConfig();
  if (!cfg.accessToken) return;
  if (jwtExpMs(cfg.accessToken) - Date.now() > 5 * 60_000) return;
  if (!cfg.refreshToken) {
    saveConfig({ accessToken: undefined, email: undefined });
    return;
  }
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${apiBase()}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: cfg.refreshToken }),
        signal: AbortSignal.timeout(8000),
      });
      const d = await res.json();
      if (d?.ok) {
        saveConfig({ accessToken: d.access_token, refreshToken: d.refresh_token ?? cfg.refreshToken });
      } else {
        saveConfig({ accessToken: undefined, refreshToken: undefined, email: undefined });
      }
    } catch {
      /* 网络失败:保留现状,下次再试 */
    } finally {
      refreshing = null;
    }
  })();
  await refreshing;
}

function authHeaders() {
  const t = loadConfig().accessToken;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** 所有请求 best-effort:考勤进程绝不能因为网络问题影响宿主 harness */
export async function post(path, body, { timeoutMs = 8000, method = "POST" } = {}) {
  try {
    await ensureFresh();
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function get(path, { timeoutMs = 8000 } = {}) {
  try {
    await ensureFresh();
    const res = await fetch(`${apiBase()}${path}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json();
  } catch {
    return null;
  }
}
