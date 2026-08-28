import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  let query = db()
    .from("companies")
    .select("id, name, industry_tags, city_tags")
    .order("name")
    .limit(12);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "公司名不合法" }, { status: 400 });
  }
  const { data, error } = await db()
    .from("companies")
    .upsert(
      { name, source: "user_created" },
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
