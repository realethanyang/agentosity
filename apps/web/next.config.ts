import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 旧 IA:/agents 拆解后并入榜单页
      { source: "/agents", destination: "/leaderboard", permanent: true },
    ];
  },
};

export default nextConfig;
