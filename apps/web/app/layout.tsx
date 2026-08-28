import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "下班榜 · Agentosity",
  description:
    "全国上班族共同维护的真实下班时间数据库。AI-native is a number now.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
