import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentosity.com"),
  title: {
    default: "Agentosity — AI 时代的考勤系统 · Agent 工时统计与排行榜",
    template: "%s · Agentosity",
  },
  description:
    "Agentosity 是 AI 时代的考勤系统:一条命令自动统计 Claude Code、Codex、OpenCode 等 Agent 的真实工时(挂机不算),公司榜/个人榜/早下班榜实时排名。AI-native? Prove it!",
  keywords: ["Agentosity", "Agent 工时", "AI 考勤", "agent-hours", "Claude Code", "Codex", "AI-native", "早点下班"],
  alternates: { canonical: "https://agentosity.com" },
  openGraph: {
    title: "Agentosity — AI 时代的考勤系统",
    description: "自动统计你的 Agent 真实工时,公司榜/个人榜实时排名。Humans clock out. Agents clock in.",
    url: "https://agentosity.com",
    siteName: "Agentosity",
    locale: "zh_CN",
    type: "website",
  },
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
            </a>{" "}
            · <a href="/community" className="underline">用户群 💬</a>
          </p>
          <p className="mt-2 text-sm font-black">
            友情链接:{" "}
            <a href="https://loophouse.app" target="_blank" rel="noopener" className="underline">LoopHouse ↗</a> ·{" "}
            <a href="https://vibecafe.ai" target="_blank" rel="noopener" className="underline">VibeCafe ↗</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
