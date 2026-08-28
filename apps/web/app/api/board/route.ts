import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { revealDayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tagType = searchParams.get("tag_type"); // industry | city
  const tag = searchParams.get("tag");

  const day = revealDayKey();
  const { data, error } = await db().rpc("fn_board", {
    p_day: day,
    p_tag_type: tagType || null,
    p_tag: tag || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
