"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deviceId } from "@/lib/device";
import { authState, saveAuth, clearAuth, freshAuthHeaders } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "done">("email");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("device");

    // Google OAuth 回跳:token 在 URL hash 里
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const oauthToken = hash.get("access_token");
    const oauthRefresh = hash.get("refresh_token");
    if (oauthToken) {
      let mail = "";
      try {
        mail = JSON.parse(atob(oauthToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? "";
      } catch { /* email 解析失败不致命 */ }
      saveAuth({ email: mail, token: oauthToken, refresh: oauthRefresh ?? undefined });
      history.replaceState(null, "", window.location.pathname + window.location.search); // 清掉 hash
      // 设备历史并入账号
      fetch("/api/auth/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${oauthToken}` },
        body: JSON.stringify({ deviceId: deviceId() }),
      }).catch(() => {});
      setStage("done");
      if (code) approveWith({ Authorization: `Bearer ${oauthToken}` }, code);
      return;
    }

    // 不信任本地存的登录态:校验/续期通过才算已登录(过期又无法续期会被清掉)
    freshAuthHeaders().then(async (h) => {
      if (h.Authorization) {
        setStage("done");
        // 已登录 + 带设备码 → 自动授权,不再要求点击
        if (code) await approveWith(h, code);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function googleLogin() {
    const qs = new URLSearchParams();
    if (deviceCode) qs.set("device", deviceCode);
    if (fromCli) qs.set("from", "cli");
    if (next) qs.set("next", next);
    const redirect = `${window.location.origin}/login${qs.toString() ? `?${qs.toString()}` : ""}`;
    window.location.href = `https://phkifnntpacovtwiwhrp.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  const [fromCli, setFromCli] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("device");
    if (code) setDeviceCode(code);
    const n = params.get("next");
    if (n && n.startsWith("/")) setNext(n);
    setFromCli(params.get("from") === "cli" || (n ?? "").includes("from=cli"));
  }, []);

  // 登录完成不让用户干等:CLI 流跳绑定页,普通流跳 next(App 设备流留在本页看"回到 App"提示)
  useEffect(() => {
    if (stage !== "done") return;
    const t = setTimeout(() => {
      if (fromCli && (!deviceCode || deviceApproved)) window.location.replace("/checkin?from=cli");
      else if (next && !deviceCode) window.location.replace(next);
    }, 800);
    return () => clearTimeout(t);
  }, [stage, deviceApproved, fromCli, next, deviceCode]);

  function friendly(msg: string): string {
    if (/security purposes/i.test(msg)) return "发送太频繁了,等 60 秒再试";
    if (/expired|invalid/i.test(msg)) return "验证码不对或已过期";
    return msg;
  }

  async function approveWith(headers: Record<string, string>, code: string) {
    const r = await fetch("/api/device/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (d.ok) setDeviceApproved(true);
    else setError(d.error ?? "授权失败");
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) setStage("code");
    else setError(friendly(d.error ?? "发送失败,稍后再试"));
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, deviceId: deviceId() }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) {
      saveAuth({ email: d.email, token: d.access_token, refresh: d.refresh_token });
      setStage("done");
      if (deviceCode) await approveWith({ Authorization: `Bearer ${d.access_token}` }, deviceCode);
    } else setError(friendly(d.error ?? "验证失败"));
  }

  if (stage === "done") {
    const a = authState();
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="nb-card bg-[var(--nb-green)] p-8">
          <div className="text-4xl">✅</div>
          <h1 className="mt-2 text-2xl font-black">已登录</h1>
          <p className="mt-2 font-bold">{a?.email}</p>
          <p className="mt-2 text-sm font-bold opacity-70">
            这台设备的打卡历史已合并进账号,换设备登录同一邮箱即可同步。
          </p>
        </div>
        {deviceCode && !deviceApproved && !error && (
          <p className="mt-6 font-bold opacity-60">正在授权你的设备…</p>
        )}
        {deviceApproved && (
          <p className="mt-6 text-lg font-black">
            {fromCli ? "🎉 已授权,正在打开绑定页…" : "🎉 已自动授权,回到终端 / App 看看吧(本页可关闭)"}
          </p>
        )}
        {next && !deviceCode && (
          <p className="mt-6 font-bold opacity-60">正在跳转…</p>
        )}
        {next && (
          <Link href={next} className="nb-btn mt-6 inline-block bg-[var(--nb-pink)] px-6 py-3 font-black text-white">
            继续 →
          </Link>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/me" className="nb-btn bg-white px-4 py-2 font-bold">我的排名 →</Link>
          <button
            onClick={() => { clearAuth(); setStage("email"); }}
            className="nb-btn bg-white px-4 py-2 font-bold opacity-60">
            退出登录
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-black">登录</h1>
      <p className="mt-1 text-sm font-bold opacity-60">
        无密码,邮箱收 6 位验证码。登录后多设备同步你的打卡记录。
      </p>

      <div className="nb-card mt-6 bg-white p-5">
        {stage === "email" ? (
          <>
            <label className="text-sm font-extrabold">邮箱(收 6 位验证码,最快 30 秒)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full p-3 font-bold outline-none"
              style={{ border: "3px solid var(--nb-ink)" }}
            />
            <button
              disabled={busy || !email.includes("@")}
              onClick={sendCode}
              className="nb-btn mt-4 w-full bg-[var(--nb-pink)] py-3 font-black text-white disabled:opacity-40"
            >
              {busy ? "发送中…" : "发验证码 →"}
            </button>
            <div className="my-4 flex items-center gap-3 text-xs font-bold opacity-40">
              <div className="h-0.5 flex-1 bg-black/20" />或<div className="h-0.5 flex-1 bg-black/20" />
            </div>
            <button
              onClick={googleLogin}
              className="nb-btn flex w-full items-center justify-center gap-2 bg-white py-2.5 text-sm font-black"
            >
              <span>G</span> 用 Google 登录
            </button>
            <p className="mt-1 text-center text-[10px] font-bold opacity-40">
              国内网络 / 现场 Wi-Fi 下 Google 可能打不开,推荐邮箱验证码
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold">
              验证码已发到 <span className="font-black">{email}</span>(几分钟内有效)
            </p>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 位验证码"
              className="mt-3 w-full p-3 text-center text-2xl font-black tracking-widest outline-none"
              style={{ border: "3px solid var(--nb-ink)" }}
            />
            <button
              disabled={busy || code.trim().length < 6}
              onClick={verify}
              className="nb-btn mt-4 w-full bg-[var(--nb-pink)] py-3 font-black text-white disabled:opacity-40"
            >
              {busy ? "验证中…" : "登录"}
            </button>
            <button onClick={() => setStage("email")} className="mt-3 text-xs font-bold underline opacity-60">
              换个邮箱
            </button>
          </>
        )}
        {error && <p className="mt-3 text-center text-sm font-bold text-red-600">{error}</p>}
      </div>
    </main>
  );
}
