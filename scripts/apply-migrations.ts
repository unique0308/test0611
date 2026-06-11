/**
 * Apply Supabase migrations through direct PostgreSQL connection.
 *
 * Why direct PG?
 *   - Supabase REST/PostgREST does not expose raw SQL execution
 *   - supabase CLI requires a separate auth flow + tool install
 *   - Direct pg is simplest for one-shot DDL/seed
 *
 * Usage:
 *   npm run db:migrate
 *
 * Idempotency:
 *   - 001_initial_schema:wraps full file in a transaction;if any object already
 *     exists, rolls back and warns(don't auto-skip——schema drift should be loud)
 *   - 002_seed_data:before running, checks if departments table has any rows;
 *     if yes, skips with a notice
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

loadEnv({ path: join(ROOT, ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    // Supabase requires SSL
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log("✓ Connected to PostgreSQL");

  const migrationsDir = join(ROOT, "supabase", "migrations");

  // ─── 001 ────────────────────────────────────────────────────────────────
  const schemaExists = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'departments'
    ) AS exists
  `);

  if (schemaExists.rows[0].exists) {
    console.log("⊙ Schema already applied (departments exists), skipping 001");
  } else {
    const sql001 = await readFile(join(migrationsDir, "001_initial_schema.sql"), "utf-8");
    console.log("→ Applying 001_initial_schema.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql001);
      await client.query("COMMIT");
      console.log("✓ 001_initial_schema applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 002 ────────────────────────────────────────────────────────────────
  const seedCount = await client.query("SELECT COUNT(*)::int AS c FROM departments");
  if (seedCount.rows[0].c > 0) {
    console.log(`⊙ Seed already applied (departments has ${seedCount.rows[0].c} rows), skipping 002`);
  } else {
    const sql002 = await readFile(join(migrationsDir, "002_seed_data.sql"), "utf-8");
    console.log("→ Applying 002_seed_data.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql002);
      await client.query("COMMIT");
      console.log("✓ 002_seed_data applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // 共用:看 models 表当前状态(决定 003 / 004 是否跑)
  async function modelStateSummary() {
    const r = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM models) AS model_count,
        (SELECT COUNT(*)::int FROM models WHERE provider = 'mock') AS mock_count,
        (SELECT COUNT(*)::int FROM models WHERE provider = 'openrouter') AS openrouter_count,
        (SELECT COUNT(*)::int FROM models WHERE provider = 'volcengine') AS volcengine_count,
        (SELECT COUNT(*)::int FROM generation_tasks) AS task_count
    `);
    return r.rows[0] as {
      model_count: number;
      mock_count: number;
      openrouter_count: number;
      volcengine_count: number;
      task_count: number;
    };
  }

  // ─── 003: replace 002's Chinese models with 2 mock placeholders ─────────
  // 幂等:已被 004 覆盖(出现 openrouter 行)→ 跳过
  let ms = await modelStateSummary();
  if (ms.openrouter_count > 0) {
    console.log("⊙ 003 superseded by 004 (openrouter rows present), skipping");
  } else if (ms.model_count === 2 && ms.mock_count === 2) {
    console.log("⊙ 003 already applied (2 mock rows), skipping");
  } else if (ms.task_count > 0) {
    console.log(
      `⚠ 003 skipped: generation_tasks has ${ms.task_count} rows; re-seeding would fail FK.`
    );
  } else {
    const sql003 = await readFile(join(migrationsDir, "003_update_models_for_mock.sql"), "utf-8");
    console.log("→ Applying 003_update_models_for_mock.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql003);
      await client.query("COMMIT");
      console.log("✓ 003_update_models_for_mock applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 004: provider-based models (openrouter + volcengine + mock) ────────
  ms = await modelStateSummary();
  if (ms.openrouter_count > 0 && (ms.volcengine_count > 0 || ms.openrouter_count >= 2) && ms.mock_count >= 2) {
    console.log("⊙ 004 already applied, skipping");
  } else if (ms.task_count > 0) {
    console.log(
      `⚠ 004 skipped: generation_tasks has ${ms.task_count} rows; re-seeding would fail FK.`
    );
  } else {
    const sql004 = await readFile(join(migrationsDir, "004_provider_based_models.sql"), "utf-8");
    console.log("→ Applying 004_provider_based_models.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql004);
      await client.query("COMMIT");
      console.log("✓ 004_provider_based_models applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 005: Seedance 改走 openrouter ──────────────────────────────────────
  const seedanceState = await client.query(`
    SELECT provider, easyrouter_model_key, enabled
    FROM models WHERE name = 'Seedance 2.0 Fast' AND type = 'video' LIMIT 1
  `);
  const sr = seedanceState.rows[0];
  if (sr && sr.provider === "openrouter" && sr.easyrouter_model_key === "bytedance/seedance-2.0-fast" && sr.enabled) {
    console.log("⊙ 005 already applied (Seedance on openrouter), skipping");
  } else {
    const sql005 = await readFile(join(migrationsDir, "005_seedance_via_openrouter.sql"), "utf-8");
    console.log("→ Applying 005_seedance_via_openrouter.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql005);
      await client.query("COMMIT");
      console.log("✓ 005_seedance_via_openrouter applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 006: enforce single active task per user ───────────────────────────
  const idxCheck = await client.query(`
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uniq_user_active_task'
  `);
  if (idxCheck.rowCount && idxCheck.rowCount > 0) {
    console.log("⊙ 006 already applied (uniq_user_active_task exists), skipping");
  } else {
    const sql006 = await readFile(join(migrationsDir, "006_enforce_single_active_task.sql"), "utf-8");
    console.log("→ Applying 006_enforce_single_active_task.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql006);
      await client.query("COMMIT");
      console.log("✓ 006_enforce_single_active_task applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 007: V1 schema (prompt_collections + reimbursement_*) ──────────────
  // 幂等:看 prompt_collections 表是否存在
  const v1SchemaCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prompt_collections'
    ) AS exists
  `);
  if (v1SchemaCheck.rows[0].exists) {
    console.log("⊙ 007 already applied (prompt_collections exists), skipping");
  } else {
    const sql007 = await readFile(join(migrationsDir, "007_v1_schema.sql"), "utf-8");
    console.log("→ Applying 007_v1_schema.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql007);
      await client.query("COMMIT");
      console.log("✓ 007_v1_schema applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 010: V1.5 部门负责人角色(users 加 is_dept_manager + managed_department_ids)
  // 注:跳过 009(预留给 V1.10 task_outputs),Week 7 实施时补
  // ─── 008: V1 seed (报销工具预设 7 项) ───────────────────────────────────
  // 幂等:看 reimbursement_tool_presets 是否已有行
  const v1SeedCheck = await client.query(
    "SELECT COUNT(*)::int AS c FROM reimbursement_tool_presets"
  );
  if (v1SeedCheck.rows[0].c > 0) {
    console.log(
      `⊙ 008 already applied (reimbursement_tool_presets has ${v1SeedCheck.rows[0].c} rows), skipping`
    );
  } else {
    const sql008 = await readFile(join(migrationsDir, "008_v1_seed.sql"), "utf-8");
    console.log("→ Applying 008_v1_seed.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql008);
      await client.query("COMMIT");
      console.log("✓ 008_v1_seed applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 010: V1.5 部门负责人字段 ───────────────────────────────────────────
  // 幂等:看 users 表是否已有 is_dept_manager 字段
  const v15ColCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_dept_manager'
    ) AS exists
  `);
  if (v15ColCheck.rows[0].exists) {
    console.log("⊙ 010 already applied (users.is_dept_manager exists), skipping");
  } else {
    const sql010 = await readFile(join(migrationsDir, "010_v1_manager_role.sql"), "utf-8");
    console.log("→ Applying 010_v1_manager_role.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql010);
      await client.query("COMMIT");
      console.log("✓ 010_v1_manager_role applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 011: V1.10 多张出图(generation_results 加 output_index)─────────
  const v110ColCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'generation_results' AND column_name = 'output_index'
    ) AS exists
  `);
  if (v110ColCheck.rows[0].exists) {
    console.log("⊙ 011 already applied (generation_results.output_index exists), skipping");
  } else {
    const sql011 = await readFile(join(migrationsDir, "011_v1_multi_output.sql"), "utf-8");
    console.log("→ Applying 011_v1_multi_output.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql011);
      await client.query("COMMIT");
      console.log("✓ 011_v1_multi_output applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 012: V1.11 模型分类展示(models 加 preview_url + description)─────
  const v111ColCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'models' AND column_name = 'description'
    ) AS exists
  `);
  if (v111ColCheck.rows[0].exists) {
    console.log("⊙ 012 already applied (models.description exists), skipping");
  } else {
    const sql012 = await readFile(join(migrationsDir, "012_v1_model_metadata.sql"), "utf-8");
    console.log("→ Applying 012_v1_model_metadata.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql012);
      await client.query("COMMIT");
      console.log("✓ 012_v1_model_metadata applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 013: V1.12 用户自定义使用目的(purpose_tags 加 is_user_created 等)
  const v112ColCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purpose_tags' AND column_name = 'is_user_created'
    ) AS exists
  `);
  if (v112ColCheck.rows[0].exists) {
    console.log("⊙ 013 already applied (purpose_tags.is_user_created exists), skipping");
  } else {
    const sql013 = await readFile(join(migrationsDir, "013_v1_user_purpose.sql"), "utf-8");
    console.log("→ Applying 013_v1_user_purpose.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql013);
      await client.query("COMMIT");
      console.log("✓ 013_v1_user_purpose applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 014: easyrouter.io provider 接入(Day 38)─────────────────────────
  const easyrouterCheck = await client.query(`
    SELECT COUNT(*)::int AS c FROM models WHERE provider = 'easyrouter'
  `);
  if (easyrouterCheck.rows[0].c > 0) {
    console.log(`⊙ 014 already applied (easyrouter has ${easyrouterCheck.rows[0].c} models), skipping`);
  } else {
    const sql014 = await readFile(join(migrationsDir, "014_v1_easyrouter_provider.sql"), "utf-8");
    console.log("→ Applying 014_v1_easyrouter_provider.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql014);
      await client.query("COMMIT");
      console.log("✓ 014_v1_easyrouter_provider applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 015: easyrouter 升 baseline + OpenRouter 下线(Day 38 末嘉斌定)──
  // 幂等判定:OpenRouter 行的 enabled 状态(015 前 TRUE / 后 FALSE)
  const m015Check = await client.query(`
    SELECT COUNT(*)::int AS c FROM models WHERE provider = 'openrouter' AND enabled = TRUE
  `);
  if (m015Check.rows[0].c === 0) {
    console.log("⊙ 015 already applied (OpenRouter all disabled), skipping");
  } else {
    const sql015 = await readFile(join(migrationsDir, "015_easyrouter_as_baseline.sql"), "utf-8");
    console.log("→ Applying 015_easyrouter_as_baseline.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql015);
      await client.query("COMMIT");
      console.log("✓ 015_easyrouter_as_baseline applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 016: V1 收藏粒度细化到单张产物(prompt_collections 加 output_index)──
  const m016Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'prompt_collections' AND column_name = 'output_index'
    ) AS exists
  `);
  if (m016Check.rows[0].exists) {
    console.log("⊙ 016 already applied (prompt_collections.output_index exists), skipping");
  } else {
    const sql016 = await readFile(join(migrationsDir, "016_v1_collection_per_output.sql"), "utf-8");
    console.log("→ Applying 016_v1_collection_per_output.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql016);
      await client.query("COMMIT");
      console.log("✓ 016_v1_collection_per_output applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 017: V1 个人月配额(users 加 monthly_quota_credits)────────────────
  const m017Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'monthly_quota_credits'
    ) AS exists
  `);
  if (m017Check.rows[0].exists) {
    console.log("⊙ 017 already applied (users.monthly_quota_credits exists), skipping");
  } else {
    const sql017 = await readFile(join(migrationsDir, "017_v1_personal_quota.sql"), "utf-8");
    console.log("→ Applying 017_v1_personal_quota.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql017);
      await client.query("COMMIT");
      console.log("✓ 017_v1_personal_quota applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 018: AI 洞察 · insight_actions(用户对洞察的操作)──────────────────
  const m018Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'insight_actions'
    ) AS exists
  `);
  if (m018Check.rows[0].exists) {
    console.log("⊙ 018 already applied (insight_actions exists), skipping");
  } else {
    const sql018 = await readFile(join(migrationsDir, "018_admin_insights.sql"), "utf-8");
    console.log("→ Applying 018_admin_insights.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql018);
      await client.query("COMMIT");
      console.log("✓ 018_admin_insights applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 019: easyrouter 加 GPT Image 2（图片）+ PixVerse v6（视频）─────────
  const m019Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM models WHERE name = 'PixVerse v6 (easyrouter)'
    ) AS exists
  `);
  if (m019Check.rows[0].exists) {
    console.log("⊙ 019 already applied (PixVerse v6 model exists), skipping");
  } else {
    const sql019 = await readFile(join(migrationsDir, "019_add_image2_seedream45.sql"), "utf-8");
    console.log("→ Applying 019_add_image2_seedream45.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql019);
      await client.query("COMMIT");
      console.log("✓ 019_add_image2_seedream45 applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 020: easyrouter 加 Gemini 3 Pro Image（Google）────────────────────
  const m020Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM models WHERE name = 'Gemini 3 Pro Image (easyrouter)'
    ) AS exists
  `);
  if (m020Check.rows[0].exists) {
    console.log("⊙ 020 already applied (Gemini 3 Pro Image exists), skipping");
  } else {
    const sql020 = await readFile(join(migrationsDir, "020_add_gemini3_pro_image.sql"), "utf-8");
    console.log("→ Applying 020_add_gemini3_pro_image.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql020);
      await client.query("COMMIT");
      console.log("✓ 020_add_gemini3_pro_image applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 021: V1 加 B 完整版会话化(conversations 表 + generation_tasks.conversation_id)──
  const m021Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'conversations'
    ) AS exists
  `);
  if (m021Check.rows[0].exists) {
    console.log("⊙ 021 already applied (conversations table exists), skipping");
  } else {
    const sql021 = await readFile(join(migrationsDir, "021_v1_conversations.sql"), "utf-8");
    console.log("→ Applying 021_v1_conversations.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql021);
      await client.query("COMMIT");
      console.log("✓ 021_v1_conversations applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 022: V1 加 B 清理 — INSIGHTS_DEMO_SEED 从 user conv 解绑(2026-05-29)─
  const demoSeedLinkedCheck = await client.query(`
    SELECT COUNT(*)::int AS c FROM generation_tasks
    WHERE prompt LIKE '[INSIGHTS_DEMO_SEED]%' AND conversation_id IS NOT NULL
  `);
  if (demoSeedLinkedCheck.rows[0].c === 0) {
    console.log("⊙ 022 already applied (no demo seed tasks linked to conversations), skipping");
  } else {
    const sql022 = await readFile(join(migrationsDir, "022_v1_unlink_demo_seed_from_conv.sql"), "utf-8");
    console.log(`→ Applying 022_v1_unlink_demo_seed_from_conv.sql (${demoSeedLinkedCheck.rows[0].c} rows to unlink) ...`);
    await client.query("BEGIN");
    try {
      await client.query(sql022);
      await client.query("COMMIT");
      console.log("✓ 022_v1_unlink_demo_seed_from_conv applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 023: M5 P1 · purpose_tags 收敛到 5 新预设(2026-06-01)──────────────
  // 幂等判定:新 tag "marketing_v2" 是否已存在(active)
  const m023Check = await client.query(`
    SELECT COUNT(*)::int AS c FROM purpose_tags
    WHERE name_normalized = 'marketing_v2' AND merged_into_id IS NULL
  `);
  if (m023Check.rows[0].c > 0) {
    console.log("⊙ 023 already applied (purpose_tag 'marketing_v2' exists), skipping");
  } else {
    const sql023 = await readFile(join(migrationsDir, "023_v1_m5_purpose_tags_5_preset.sql"), "utf-8");
    console.log("→ Applying 023_v1_m5_purpose_tags_5_preset.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql023);
      await client.query("COMMIT");
      console.log("✓ 023_v1_m5_purpose_tags_5_preset applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── 024: M5 P1 波 2 · conversations 加 primary_purpose_tag_id(2026-06-01)
  // 幂等判定:列是否已存在
  const m024Check = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'primary_purpose_tag_id'
    ) AS exists
  `);
  if (m024Check.rows[0].exists) {
    console.log("⊙ 024 already applied (conversations.primary_purpose_tag_id exists), skipping");
  } else {
    const sql024 = await readFile(join(migrationsDir, "024_v1_m5_conversation_primary_tag.sql"), "utf-8");
    console.log("→ Applying 024_v1_m5_conversation_primary_tag.sql ...");
    await client.query("BEGIN");
    try {
      await client.query(sql024);
      await client.query("COMMIT");
      console.log("✓ 024_v1_m5_conversation_primary_tag applied");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ─── Verification SELECT ────────────────────────────────────────────────
  console.log("\n--- Verification ---");
  const checks: Array<[string, string, number]> = [
    ["departments", "SELECT COUNT(*)::int AS c FROM departments", 4],
    ["users", "SELECT COUNT(*)::int AS c FROM users", 6],
    // 023 后:5 新 active seed + 7 旧 merged seed = 12 seed(user-created tag 不算)
    ["purpose_tags (active seed)", "SELECT COUNT(*)::int AS c FROM purpose_tags WHERE is_user_created = FALSE AND merged_into_id IS NULL", 5],
    ["purpose_tags (merged seed)", "SELECT COUNT(*)::int AS c FROM purpose_tags WHERE is_user_created = FALSE AND merged_into_id IS NOT NULL", 7],
    ["models", "SELECT COUNT(*)::int AS c FROM models", 9],
    ["models (openrouter)", "SELECT COUNT(*)::int AS c FROM models WHERE provider='openrouter'", 2],
    ["models (easyrouter)", "SELECT COUNT(*)::int AS c FROM models WHERE provider='easyrouter'", 5],
    ["models (volcengine)", "SELECT COUNT(*)::int AS c FROM models WHERE provider='volcengine'", 0],
    ["models (mock)", "SELECT COUNT(*)::int AS c FROM models WHERE provider='mock'", 2],
    ["quotas", "SELECT COUNT(*)::int AS c FROM quotas", 4],
    ["reimbursement_tool_presets", "SELECT COUNT(*)::int AS c FROM reimbursement_tool_presets", 7],
    ["users (managers)", "SELECT COUNT(*)::int AS c FROM users WHERE is_dept_manager = TRUE", 4]
  ];

  let allOk = true;
  for (const [label, query, expected] of checks) {
    const res = await client.query(query);
    const actual = res.rows[0].c as number;
    const ok = actual === expected;
    if (!ok) allOk = false;
    console.log(`${ok ? "✓" : "✗"} ${label}: ${actual} (expected ${expected})`);
  }

  console.log("\n--- Departments + Users sample ---");
  const sample = await client.query(`
    SELECT u.name AS user_name, u.email, d.name AS dept_name
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    ORDER BY d.name, u.name
  `);
  for (const r of sample.rows) {
    console.log(`  ${r.user_name.padEnd(4)} <${r.email}> @ ${r.dept_name}`);
  }

  console.log("\n--- Models ---");
  const models = await client.query(`
    SELECT name, type, is_baseline, credits_per_unit, priority
    FROM models ORDER BY type, sort_order
  `);
  for (const r of models.rows) {
    console.log(
      `  [${r.type.padEnd(5)}] ${r.name.padEnd(20)} ` +
        `${r.is_baseline ? "(baseline) " : "           "}` +
        `${r.credits_per_unit} 积分/单位  P${r.priority}`
    );
  }

  await client.end();

  if (!allOk) {
    console.error("\n✗ Some checks failed");
    process.exit(1);
  }
  console.log("\n✓ All checks passed");
}

main().catch(err => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
