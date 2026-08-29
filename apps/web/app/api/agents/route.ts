import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Agentosity 公司榜(实时口径:含今天;days=1|7|30)+ 在岗实况 */
export async function GET(req: NextRequest) {
  const daysParam = new URL(req.url).searchParams.get("days");
  const days = daysParam === "30" ? 30 : daysParam === "1" ? 1 : 7;
  const to = todayKey();
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const [board, live] = await Promise.all([
    db().rpc("fn_agents_board", { p_from: from.toISOString().slice(0, 10), p_to: to }),
    db().rpc("fn_live_agents"),
  ]);
  if (board.error) return NextResponse.json({ error: board.error.message }, { status: 500 });
  if (live.error) return NextResponse.json({ error: live.error.message }, { status: 500 });
  return NextResponse.json({
    period: { from: from.toISOString().slice(0, 10), to, days },
    board: board.data,
    live: live.data,
  });
}
