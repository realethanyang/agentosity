import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { revealDayKey } from "@/lib/time";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const deviceId = new URL(req.url).searchParams.get("device");
  const userToken = await userTokenFromRequest(req);
  const token = userToken ?? deviceId;
  if (!token) return NextResponse.json({ error: "缺少 device" }, { status: 400 });

  const { data, error } = await db().rpc("fn_my_rank", {
    p_device: token,
    p_day: revealDayKey(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
