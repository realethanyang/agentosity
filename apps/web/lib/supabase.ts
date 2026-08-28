import { createClient, SupabaseClient } from "@supabase/supabase-js";

// schema 由 DATA_SCHEMA 运行时决定,放宽泛型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any, any, any> | null = null;

/**
 * 服务端专用 client(service role,绕过 RLS)。所有数据读写都走 API routes。
 * DATA_SCHEMA=demo 时整站切到演示数据世界(demo.agentosity.com 用)。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function db(): SupabaseClient<any, any, any> {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        db: { schema: process.env.DATA_SCHEMA || "public" },
      }
    );
  }
  return client;
}
