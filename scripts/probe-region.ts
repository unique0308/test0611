/**
 * One-shot: find which Supabase pooler region hosts our project.
 * Try a connection to each candidate region; the right one returns auth error
 * for wrong password but NOT "tenant not found" for wrong user.
 */
import { Client } from "pg";
import { config as loadEnv } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
loadEnv({ path: join(dirname(__filename), "..", ".env.local") });

const REF = "aflqqltlbhiptirhsqsu";
const PWD = "nT1sp0re2tYPii6x";

const REGIONS = [
  "ap-northeast-1", // Tokyo
  "ap-southeast-1", // Singapore
  "ap-southeast-2", // Sydney
  "ap-northeast-2", // Seoul
  "ap-south-1",     // Mumbai
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-west-1",
  "eu-central-1",
  "ap-east-1"       // HK
];

async function tryRegion(region: string): Promise<boolean> {
  const url = `postgresql://postgres.${REF}:${PWD}@aws-1-${region}.pooler.supabase.com:5432/postgres`;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch (e: unknown) {
    const msg = (e as Error).message || String(e);
    if (msg.includes("tenant") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      // wrong region, swallow
      try { await client.end(); } catch {}
      return false;
    }
    // some other error — log but keep searching
    process.stderr.write(`  [${region}] ${msg.slice(0, 100)}\n`);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  for (const r of REGIONS) {
    process.stdout.write(`Trying ${r} ... `);
    const ok = await tryRegion(r);
    if (ok) {
      console.log("✓ MATCH");
      console.log(`\nUse: aws-1-${r}.pooler.supabase.com`);
      return;
    }
    console.log("no");
  }
  console.log("\nNo region matched — possibly aws-1-* / new pooler format. Need user to provide connection string.");
  process.exit(1);
}

main();
