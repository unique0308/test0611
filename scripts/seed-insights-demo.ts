/**
 * 注入 AI 洞察 demo 数据：让 4 条规则全部触发
 *
 * 用法：
 *   tsx --env-file=.env.local scripts/seed-insights-demo.ts        # 注入
 *   tsx --env-file=.env.local scripts/seed-insights-demo.ts clean  # 仅清理
 *
 * 幂等：所有插入的 task 用 prompt 前缀 [INSIGHTS_DEMO_SEED] 标识；重复跑会先清理再注入。
 * quotas 用 ON CONFLICT 升级（不影响其它历史月份）。
 *
 * 触发设计（基于"今天 2026-05-27"）：
 *   - quota-forecast normal × 2: 产研部 used=4740 (94.8%) / 品牌创意部 used=5040 (91.6%)
 *   - quota-fit normal × 1: 市场部 used=180 (3.3%, 时间进度 87%)
 *   - user-spike urgent × 2: 张三新激活 / 钱七 5×
 *   - model-mom urgent × 1: Mock Image +201%
 *   - model-mom normal × 2: Mock Video -57% / Dreamina easyrouter NEW
 */

import { Client } from "pg";

const SEED_TAG = "[INSIGHTS_DEMO_SEED]";

const DEPTS = {
  rd: "d4196cd4-318f-4259-a602-2ba3a6818ff6",
  brand: "adf8de64-47ae-4880-bc40-19c777dd9c89",
  marketing: "4ec6898a-eaad-40d9-a087-bb9650563d9e",
  ecom: "ac7a3411-95ef-40e6-9fb6-397110b7e0b1"
};
const DEPT_NAMES: Record<string, string> = {
  [DEPTS.rd]: "产品研发部",
  [DEPTS.brand]: "品牌创意部",
  [DEPTS.marketing]: "市场部",
  [DEPTS.ecom]: "电商运营部"
};

const USERS = {
  jiabin: "01016057-3b91-4450-9dab-323640769222",
  lisi: "0dba29d5-d84b-4466-b6b1-9270d70d5453",
  zhangsan: "b03dec65-8fed-4685-8f2b-adcbf19a4594",
  qianqi: "ecbc65b8-3871-4668-9ee4-7048466d36cf",
  zhaoliu: "9caa43c1-1519-46ce-91d9-7cf00a102be6",
  wangwu: "edb529d9-ad0a-4e1b-9e91-f74227b8cf14"
};

type ModelDef = {
  id: string;
  name: string;
  type: "image" | "video";
  credits: number;
  ratio: string;
};
const MODELS: Record<string, ModelDef> = {
  mockImage: {
    id: "6635f7ad-2ce6-4030-88e4-be0e98b1d1a4",
    name: "Mock Image",
    type: "image",
    credits: 30,
    ratio: "1:1"
  },
  mockVideo: {
    id: "fc23b40d-a2a5-42bb-8dc0-a20fde7bc036",
    name: "Mock Video",
    type: "video",
    credits: 100,
    ratio: "16:9"
  },
  gemini: {
    id: "d144ee80-5a57-4d78-a8f9-247f28ab1907",
    name: "Gemini 2.5 Flash Image",
    type: "image",
    credits: 28,
    ratio: "1:1"
  },
  seedance: {
    id: "ac29bd84-7325-4b8f-98d9-204aa6ddec7a",
    name: "Seedance 2.0 Fast",
    type: "video",
    credits: 87,
    ratio: "16:9"
  },
  dreaminER: {
    id: "c108d6f3-7c29-4cc4-872b-ec984f7d9eca",
    name: "Dreamina Seedance 2.0 Fast (easyrouter)",
    type: "video",
    credits: 120,
    ratio: "16:9"
  }
};

const PURPOSE_TAG_ID = "d05ea197-99b6-404b-946a-48ac2dea79df";
const PURPOSE_TAG_NAME = "未分类";

type TaskSpec = {
  user_id: string;
  dept_id: string;
  model: ModelDef;
  count: number;
  /** ISO date YYYY-MM-DD：起始日期 */
  from: string;
  /** ISO date YYYY-MM-DD：结束日期（含），count 任务在 [from, to] 之间均匀分布 */
  to: string;
  /** 自定义 prompt 后缀（仅用于备注、易识别） */
  noteSuffix?: string;
};

const TASKS: TaskSpec[] = [
  // ───── 2026-05 本月（quota-forecast / quota-fit / user-spike / model-mom 本月数据） ─────
  // 产研部 = 4740（嘉斌 Mock Image 100 + 李四 Seedance 20）
  { user_id: USERS.jiabin, dept_id: DEPTS.rd, model: MODELS.mockImage, count: 100, from: "2026-05-01", to: "2026-05-15", noteSuffix: "rd-mock" },
  { user_id: USERS.lisi, dept_id: DEPTS.rd, model: MODELS.seedance, count: 20, from: "2026-05-01", to: "2026-05-15", noteSuffix: "rd-seedance" },

  // 品牌创意部 = 5040 (91.6%)
  //   张三本周 60×30=1800 + 钱七本周 50×30=1500 + 钱七上周 10×30=300 + 张三 Dreamina 12×120=1440 = 5040
  //   91.6% → forecast 5786 → overshoot 5.2% → quota-forecast normal ✓
  { user_id: USERS.zhangsan, dept_id: DEPTS.brand, model: MODELS.mockImage, count: 60, from: "2026-05-20", to: "2026-05-26", noteSuffix: "brand-spike-zhangsan" },
  { user_id: USERS.qianqi, dept_id: DEPTS.brand, model: MODELS.mockImage, count: 50, from: "2026-05-20", to: "2026-05-26", noteSuffix: "brand-spike-qianqi" },
  { user_id: USERS.qianqi, dept_id: DEPTS.brand, model: MODELS.mockImage, count: 10, from: "2026-05-13", to: "2026-05-19", noteSuffix: "brand-base-qianqi" },
  { user_id: USERS.zhangsan, dept_id: DEPTS.brand, model: MODELS.dreaminER, count: 12, from: "2026-05-10", to: "2026-05-12", noteSuffix: "brand-new-model" },

  // 市场部 = 180（quota-fit 触发：低用量）
  { user_id: USERS.zhaoliu, dept_id: DEPTS.marketing, model: MODELS.mockImage, count: 6, from: "2026-05-01", to: "2026-05-10", noteSuffix: "marketing-low" },

  // 电商运营部 = 1500（不触发任何告警）
  { user_id: USERS.wangwu, dept_id: DEPTS.ecom, model: MODELS.mockVideo, count: 15, from: "2026-05-01", to: "2026-05-15", noteSuffix: "ecom-normal" },

  // ───── 2026-04 上月（model-mom 基线） ─────
  // 上月 Mock Image = 75 次 = 2250（本月 6780 → +201% urgent）
  { user_id: USERS.jiabin, dept_id: DEPTS.rd, model: MODELS.mockImage, count: 30, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-rd-mock" },
  { user_id: USERS.zhangsan, dept_id: DEPTS.brand, model: MODELS.mockImage, count: 20, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-brand-zhangsan" },
  { user_id: USERS.qianqi, dept_id: DEPTS.brand, model: MODELS.mockImage, count: 10, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-brand-qianqi" },
  { user_id: USERS.zhaoliu, dept_id: DEPTS.marketing, model: MODELS.mockImage, count: 15, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-marketing" },

  // 上月 Mock Video = 35 次 = 3500（本月 1500 → -57% normal）
  { user_id: USERS.wangwu, dept_id: DEPTS.ecom, model: MODELS.mockVideo, count: 35, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-ecom-video" },

  // 上月 Gemini 2.5 = 50 次 = 1400（本月 0 → 跳过，因本月 < 500）
  { user_id: USERS.lisi, dept_id: DEPTS.rd, model: MODELS.gemini, count: 50, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-rd-gemini" },

  // 上月 Seedance Fast = 20 次（本月 20 次平稳）
  { user_id: USERS.jiabin, dept_id: DEPTS.rd, model: MODELS.seedance, count: 20, from: "2026-04-15", to: "2026-04-30", noteSuffix: "prev-rd-seedance" }

  // Dreamina easyrouter 上月 0（本月 12 次 = 1440 → NEW normal）
];

// 部门 quotas（本月 + 上月，便于 6 月历史小图)
const QUOTAS: Array<{ dept: string; month: string; limit: number }> = [
  { dept: DEPTS.rd, month: "2026-05-01", limit: 5000 },
  { dept: DEPTS.brand, month: "2026-05-01", limit: 5500 },
  { dept: DEPTS.marketing, month: "2026-05-01", limit: 5500 },
  { dept: DEPTS.ecom, month: "2026-05-01", limit: 5500 },
  // 4 月（用来让 6 月历史卡有 1-2 个数据点）
  { dept: DEPTS.rd, month: "2026-04-01", limit: 5000 },
  { dept: DEPTS.brand, month: "2026-04-01", limit: 5500 },
  { dept: DEPTS.marketing, month: "2026-04-01", limit: 5500 },
  { dept: DEPTS.ecom, month: "2026-04-01", limit: 5500 }
];

function spreadDates(fromIso: string, toIso: string, count: number): Date[] {
  const fromMs = new Date(fromIso + "T08:00:00Z").getTime();
  const toMs = new Date(toIso + "T20:00:00Z").getTime();
  if (count <= 1) return [new Date(fromMs)];
  const span = toMs - fromMs;
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    // 加一点伪随机偏移避免分钟级冲突
    const ms = fromMs + (span * i) / (count - 1) + (i * 17) % 60_000;
    out.push(new Date(ms));
  }
  return out;
}

async function main() {
  const mode = process.argv[2];
  const cleanOnly = mode === "clean";

  const dburl = process.env.DATABASE_URL;
  if (!dburl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const c = new Client({ connectionString: dburl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    // 1. 清掉历史 demo 任务
    const del = await c.query(
      `DELETE FROM generation_tasks WHERE prompt LIKE $1 RETURNING id`,
      [`${SEED_TAG}%`]
    );
    console.log(`✓ deleted ${del.rowCount} previous demo tasks`);

    if (cleanOnly) {
      console.log("clean mode — done");
      return;
    }

    // 2. 升级 quotas
    for (const q of QUOTAS) {
      await c.query(
        `INSERT INTO quotas (department_id, month, credits_limit)
         VALUES ($1, $2, $3)
         ON CONFLICT (department_id, month) DO UPDATE SET credits_limit = EXCLUDED.credits_limit, updated_at = now()`,
        [q.dept, q.month, q.limit]
      );
    }
    console.log(`✓ upserted ${QUOTAS.length} quotas`);

    // 3. 注入任务
    let totalRows = 0;
    for (const spec of TASKS) {
      const dates = spreadDates(spec.from, spec.to, spec.count);
      const deptName = DEPT_NAMES[spec.dept_id];
      // 批量 INSERT
      const values: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const d of dates) {
        const prompt = `${SEED_TAG} ${spec.noteSuffix ?? ""} #${idx}`;
        values.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, 'succeeded', $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        params.push(
          spec.user_id,
          spec.dept_id,
          deptName,
          spec.model.type,
          spec.model.id,
          spec.model.name,
          prompt,
          spec.model.ratio,
          PURPOSE_TAG_ID,
          PURPOSE_TAG_NAME,
          spec.model.credits, // credits_cost
          (spec.model.credits / 100).toFixed(4), // cost_cny
          d.toISOString(), // created_at
          d.toISOString() // completed_at
        );
      }
      const sql = `
        INSERT INTO generation_tasks
          (user_id, department_id, department_name, type, model_id, model_name, prompt, ratio, purpose_tag_id, purpose_tag_name, status, credits_cost, cost_cny, created_at, completed_at)
        VALUES ${values.join(", ")}
      `;
      await c.query(sql, params);
      totalRows += dates.length;
    }
    console.log(`✓ inserted ${totalRows} demo tasks`);

    // 4. 简要验证
    const summary = await c.query<{ department_name: string; total: string }>(
      `SELECT department_name, SUM(credits_cost)::int AS total
       FROM generation_tasks
       WHERE prompt LIKE $1 AND created_at >= '2026-05-01'
       GROUP BY department_name
       ORDER BY department_name`,
      [`${SEED_TAG}%`]
    );
    console.log("\n本月各部门累计（demo seed）：");
    for (const r of summary.rows) {
      console.log(`  ${r.department_name}: ${r.total} 积分`);
    }

    const modelSum = await c.query<{
      model_name: string;
      this_month: string;
      prev_month: string;
    }>(
      `SELECT
         model_name,
         SUM(CASE WHEN created_at >= '2026-05-01' THEN credits_cost ELSE 0 END)::int AS this_month,
         SUM(CASE WHEN created_at < '2026-05-01' AND created_at >= '2026-04-01' THEN credits_cost ELSE 0 END)::int AS prev_month
       FROM generation_tasks
       WHERE prompt LIKE $1
       GROUP BY model_name
       ORDER BY model_name`,
      [`${SEED_TAG}%`]
    );
    console.log("\n各模型本月 vs 上月（demo seed）：");
    for (const r of modelSum.rows) {
      console.log(`  ${r.model_name}: 本月 ${r.this_month} / 上月 ${r.prev_month}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
