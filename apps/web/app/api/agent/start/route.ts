import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Agent 考勤:会话开始。body: { company, harness?, probe?, deviceId? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const company = body?.company?.trim();
  if (!company) return NextResponse.json({ error: "缺少 company" }, { status: 400 });

  // find-or-create 公司
  const supa = db();
  let { data: comp } = await supa
    .from("companies")
    .select("id")
    .eq("name", company)
    .maybeSingle();
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
      user_token: body?.deviceId ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session_id: data.id });
}
