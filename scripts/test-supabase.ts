/**
 * Test supabase-js connectivity via PostgREST (not direct PG).
 * If schema not applied yet, expects 404 on missing tables but auth itself works.
 */
import { config as loadEnv } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
loadEnv({ path: join(dirname(__filename), "..", ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  // Hit a known endpoint just to check connectivity & auth.
  // information_schema isn't exposed via PostgREST, so we try our own tables.
  const { data, error } = await supabase.from("departments").select("*").limit(1);
  if (error) {
    console.log("⊘ Query returned error (may be expected if schema not applied):");
    console.log("  ", error.message);
    console.log("  hint:", error.hint ?? "(none)");
    console.log("  code:", error.code);
  } else {
    console.log(`✓ Query succeeded, rows: ${data?.length ?? 0}`);
    if (data && data.length > 0) console.log("  sample:", data[0]);
  }
}

main().catch(e => {
  console.error("✗ Connectivity test failed:", e.message);
  process.exit(1);
});
