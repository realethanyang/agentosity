import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://agentosity.com";
  return ["", "/leaderboard", "/start", "/community", "/login", "/checkin"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" || p === "/leaderboard" ? "hourly" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
