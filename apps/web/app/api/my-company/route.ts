import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authFromRequest } from "@/lib/auth-server";
import { todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 中环:我的公司 —— 实时脉搏 + 社会坐标(双榜名次,含标签口径) */
export async function GET(req: NextRequest) {
  const { userToken, provided } = await authFromRequest(req);
  if (provided && !userToken) {
    return NextResponse.json({ error: "登录态校验失败,稍后重试" }, { status: 401 });
  }
  const device = new URL(req.url).searchParams.get("device");
  const token = userToken ?? device;
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  const { data: prof } = await db()
    .from("profiles")
    .select("companies(id, name, industry_tags, city_tags)")
    .eq("user_token", token)
    .maybeSingle();
  const company = prof?.companies as unknown as {
    id: string;
    name: string;
    industry_tags: string[];
    city_tags: string[];
  } | null;
  if (!company) return NextResponse.json({ company: null });

  const to = todayKey(); // agent 口径实时含今天
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 6);

  const [pulse, ranks] = await Promise.all([
    db().rpc("fn_company_pulse", { p_company: company.id }),
    db().rpc("fn_company_ranks", {
      p_company: company.id,
      p_from: from.toISOString().slice(0, 10),
      p_to: to,
      p_day: todayKey(), // 人类榜名次实时口径
    }),
  ]);
  if (pulse.error) return NextResponse.json({ error: pulse.error.message }, { status: 500 });
  if (ranks.error) return NextResponse.json({ error: ranks.error.message }, { status: 500 });

  return NextResponse.json({ company, pulse: pulse.data, ranks: ranks.data });
}
