import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 人类实时脉搏:今天已下班 / 还在岗 / 全员撤离的公司数 */
export async function GET() {
  const { data, error } = await db().rpc("fn_pulse");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
