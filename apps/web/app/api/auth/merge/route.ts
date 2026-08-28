import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 登录后把某个设备身份的历史并入账号(menu bar / CLI 登录后调用) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const deviceId = body?.deviceId?.trim();
  const userToken = await userTokenFromRequest(req);
  if (!deviceId || !userToken) {
    return NextResponse.json({ error: "缺少 deviceId / 登录态" }, { status: 400 });
  }
  const { error } = await db().rpc("fn_merge_identity", {
    p_device: deviceId,
    p_user: userToken,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
