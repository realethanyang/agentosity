import { apiBase, loadConfig } from "./config.js";

function authHeaders() {
  const t = loadConfig().accessToken;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** 所有请求 best-effort:考勤进程绝不能因为网络问题影响宿主 harness */
export async function post(path, body, { timeoutMs = 8000 } = {}) {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
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
    const res = await fetch(`${apiBase()}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json();
  } catch {
    return null;
  }
}
