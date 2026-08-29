"use client";

import { useEffect, useState } from "react";

const CMD = "npx agentosity init";

export default function StartPage() {
  const [isMac, setIsMac] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showCmd, setShowCmd] = useState(false);

  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const cmdBlock = (
    <button
      onClick={() => {
        navigator.clipboard.writeText(CMD).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="nb-card mt-3 block w-full cursor-pointer bg-[var(--nb-ink)] p-4 text-left text-base font-bold text-white"
      title="点击复制"
    >
      <span className="flex items-center justify-between gap-3">
        <code>{CMD}</code>
        <span className="shrink-0 text-xs opacity-70">{copied ? "✅ 已复制" : "📋 点击复制"}</span>
      </span>
    </button>
  );

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <h1 className="text-3xl font-black">接入 Agent 考勤</h1>
      <p className="mt-1 text-sm font-bold opacity-60">
        一次接入,你的每个 Agent 会话自动打卡上下班。全程引导:登录 → 网页选公司 → 完成。
      </p>

      {isMac ? (
        <>
          <section className="nb-card mt-5 bg-[var(--nb-yellow)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">🖥 mac 菜单栏 App(推荐)</h2>
                <p className="mt-1 text-xs font-bold opacity-70">
                  常驻实时数字 · 一键打卡 · 一键接入 · 📡 雷达自动补录已开着的会话
                </p>
              </div>
              <a href="https://github.com/realethanyang/agentosity/releases/latest/download/Agentosity.app.zip"
                className="nb-btn bg-[var(--nb-ink)] px-5 py-2 font-black text-white">
                下载 ↓
              </a>
            </div>
            <p className="mt-2 text-xs font-bold opacity-50">已 Apple 公证,解压拖进「应用程序」,双击即用</p>
          </section>
          <button onClick={() => setShowCmd(!showCmd)} className="mt-3 text-xs font-bold underline opacity-60">
            {showCmd ? "收起" : "不想装 App?一条命令(全平台通用)→"}
          </button>
          {showCmd && cmdBlock}
        </>
      ) : (
        <section className="nb-card mt-5 bg-[var(--nb-yellow)] p-5">
          <h2 className="text-xl font-black">一条命令(需要 Node.js)</h2>
          {cmdBlock}
          <p className="mt-2 text-xs font-bold opacity-60">mac 用户也可以直接下载菜单栏 App(见 GitHub Releases)</p>
        </section>
      )}

      {/* 支持范围 */}
      <section className="nb-card mt-5 bg-white p-5">
        <h2 className="text-lg font-black">支持的 Agent Harness</h2>
        <div className="mt-2 flex flex-wrap gap-1 text-xs font-bold">
          {["Claude Code", "Codex CLI", "OpenCode", "Gemini CLI", "Pi", "Kimi Code", "Goose", "Hermes", "OpenClaw", "Grok", "MiMo Code", "Cursor", "Windsurf"].map((h) => (
            <span key={h} className="border-2 border-black bg-white px-2 py-0.5">{h}</span>
          ))}
          <span className="px-1 py-0.5 opacity-60">…任何支持 stdio MCP 的 harness</span>
        </div>
        <p className="mt-2 text-xs font-bold opacity-60">
          活跃度探针(区分 ⚡干活 / 😴挂机)精确支持前 11 家,Cursor / Windsurf 等按在岗时长计。
        </p>
      </section>

      {/* 隐私承诺 */}
      <section className="nb-card mt-5 bg-white p-5">
        <h2 className="text-lg font-black">🔒 我们承诺</h2>
        <ul className="mt-2 space-y-1 text-sm font-bold">
          <li>· 只上报<span className="font-black">时长与状态</span>:开始、结束、心跳、是否在干活;</li>
          <li>· <span className="font-black">绝不读取</span>你的代码、对话内容、文件内容——活跃探测只看文件时间戳;</li>
          <li>· 模型零参与:考勤对你的 Agent 完全透明,不占 prompt、不加工具调用;</li>
          <li>
            · 全部开源,自行审计:{" "}
            <a href="https://github.com/realethanyang/agentosity" target="_blank" rel="noopener" className="underline">
              github.com/realethanyang/agentosity ↗
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
