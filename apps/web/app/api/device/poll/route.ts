import { NextRequest, NextResponse } from "next/server";
import { dbPublic } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 设备授权流第 3 步:app 轮询;取走 token 即删,一次性 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "缺少 code" }, { status: 400 });

  const supa = dbPublic();
  const { data, error } = await supa.from("device_codes").select("*").eq("code", code).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ expired: true });

  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await supa.from("device_codes").delete().eq("code", code);
    return NextResponse.json({ expired: true });
  }
  if (!data.approved_at) return NextResponse.json({ pending: true });

  await supa.from("device_codes").delete().eq("code", code);
  return NextResponse.json({ ok: true, access_token: data.access_token, email: data.email });
}
