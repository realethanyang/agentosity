import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { todayKey } from "@/lib/time";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 我的 Agent 今日战报:活跃时长 / 会话数 / 此刻在岗 */
export async function GET(req: NextRequest) {
  const device = new URL(req.url).searchParams.get("device");
  const token = (await userTokenFromRequest(req)) ?? device;
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  const dayStart = new Date(`${todayKey()}T05:00:00+08:00`).toISOString();
  const { data, error } = await db()
    .from("agent_sessions")
    .select("active_seconds, started_at, last_heartbeat_at, ended_at")
    .eq("user_token", token)
    .gte("started_at", dayStart);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  let activeSeconds = 0;
  let sessionSeconds = 0;
  let live = 0;
  for (const s of data ?? []) {
    activeSeconds += s.active_seconds ?? 0;
    const end = s.ended_at ?? s.last_heartbeat_at;
    sessionSeconds += Math.max(0, (new Date(end).getTime() - new Date(s.started_at).getTime()) / 1000);
    if (!s.ended_at && now - new Date(s.last_heartbeat_at).getTime() < 3 * 60 * 1000) live++;
  }
  return NextResponse.json({
    day: todayKey(),
    sessions: data?.length ?? 0,
    active_hours: Math.round((activeSeconds / 3600) * 10) / 10,
    session_hours: Math.round((sessionSeconds / 3600) * 10) / 10,
    live_now: live,
  });
}
