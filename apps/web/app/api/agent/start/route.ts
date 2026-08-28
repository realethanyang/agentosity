import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** Agent 考勤:会话开始。body: { company, harness?, probe?, deviceId? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const company = body?.company?.trim();
  if (!company) return NextResponse.json({ error: "缺少 company" }, { status: 400 });

  // find-or-create 公司(大小写不敏感)
  const supa = db();
  const { data: matches } = await supa
    .from("companies")
    .select("id")
    .ilike("name", company.replace(/[%_]/g, "\\$&"))
    .limit(1);
  let comp = matches?.[0] ?? null;
  if (!comp) {
    const created = await supa
      .from("companies")
      .upsert({ name: company, source: "user_created" }, { onConflict: "name" })
      .select("id")
      .single();
    if (created.error)
      return NextResponse.json({ error: created.error.message }, { status: 500 });
    comp = created.data;
  }

  const { data, error } = await supa
    .from("agent_sessions")
    .insert({
      company_id: comp.id,
      harness: body?.harness ?? "unknown",
      probe: body?.probe ?? "none",
      user_token: (await userTokenFromRequest(req)) ?? body?.deviceId ?? null,
      last_active_at: new Date().toISOString(), // 刚拉起会话 = 用户正开工
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session_id: data.id });
}
