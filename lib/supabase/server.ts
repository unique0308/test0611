import { createClient } from "@supabase/supabase-js";
import { configureNodeProxyFromEnv } from "@/lib/network/proxy";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 后端使用的客户端,用 service_role key 绕过 RLS
// ⚠️ 绝对不能暴露到浏览器(技术跟踪 6.1)
export function getServerClient() {
  configureNodeProxyFromEnv();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase server env not configured: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing. " +
        "见 LOCAL_SECRETS.md 第 1 节。"
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
