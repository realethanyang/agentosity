import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentosity — AI-native is a number now.",
  description:
    "AI 时代的考勤系统:自动测量你和你公司的 Agent 工时,让「AI 替人扛了多少活」成为可测量、可比较、可炫耀的数字。你的下班时间,是它最有人味的注脚。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <Nav />
        {children}
        <footer className="mx-auto max-w-3xl px-4 py-10 text-center text-xs font-bold opacity-60">
          <p>
            Agentosity — Humans clock out. Agents clock in. · VibeHacks #5 ·{" "}
            <a href="/start" className="underline">接入</a> ·{" "}
            <a
              href="https://github.com/realethanyang/agentosity"
              target="_blank"
              rel="noopener"
              className="underline"
            >
              GitHub 开源 ↗
            </a>
          </p>
          <p className="mt-2 opacity-80">
            友情链接:{" "}
            <a href="https://loophouse.app" target="_blank" rel="noopener" className="underline">LoopHouse</a> ·{" "}
            <a href="https://vibecafe.ai" target="_blank" rel="noopener" className="underline">VibeCafe</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
