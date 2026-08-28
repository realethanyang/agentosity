import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { revealDayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const deviceId = new URL(req.url).searchParams.get("device");
  if (!deviceId) return NextResponse.json({ error: "缺少 device" }, { status: 400 });

  const { data, error } = await db().rpc("fn_my_rank", {
    p_device: deviceId,
    p_day: revealDayKey(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
