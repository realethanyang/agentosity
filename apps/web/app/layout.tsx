import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "下班榜 · 全国上班族共同维护的真实下班时间数据库",
  description:
    "下班打卡,公司按平均下班时间排名,只公布前三。AI-native is a number now.",
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
          下班榜 · Agentosity — AI-native is a number now. · VibeHacks #5
        </footer>
      </body>
    </html>
  );
}
