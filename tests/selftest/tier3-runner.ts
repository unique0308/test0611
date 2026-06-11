import fs from "node:fs";
import { Client } from "pg";

const BASE_URL = process.env.SELFTEST_BASE_URL ?? "http://localhost:3000";
const REPORT_PATH = "SELFTEST_TIER3_REPORT.md";

if (fs.existsSync(".env.local")) {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

type Status = "PASS" | "FAIL" | "WARN";
type Result = { id: string; name: string; status: Status; detail: string };

const results: Result[] = [];
const cleanupTaskIds = new Set<string>();
const cleanupConvIds = new Set<string>();
const cleanupReimbIds = new Set<number>();

function record(id: string, name: string, status: Status, detail = "") {
  results.push({ id, name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "!";
  console.log(`${icon} ${id} ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookie(userId: string) {
  return `auth_mock_user_id=${userId}`;
}

async function api(userId: string, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Cookie", cookie(userId));
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function page(userId: string, path: string, tries = 3) {
  let last = await api(userId, path);
  for (let i = 1; i < tries && last.status >= 500; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    last = await api(userId, path);
  }
  return last;
}

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query(sql, params);
  return (r.rows[0] as T | undefined) ?? null;
}

async function all<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}

async function createConversation(userId: string) {
  const r = await api(userId, "/api/conversations", { method: "POST" });
  const body = r.body as { conversation?: { id: string } } | null;
  if (r.status !== 201 || !body?.conversation?.id) {
    throw new Error(`create conversation failed ${r.status}: ${JSON.stringify(r.body)}`);
  }
  cleanupConvIds.add(body.conversation.id);
  return body.conversation;
}

async function patchConversation(userId: string, id: string, body: Record<string, unknown>) {
  return api(userId, `/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

async function waitTask(userId: string, taskId: string, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api(userId, `/api/tasks/${taskId}`);
    if (r.status !== 200) throw new Error(`task poll failed ${r.status}: ${r.text}`);
    const body = r.body as { status?: string };
    if (["succeeded", "failed", "cancelled"].includes(String(body.status))) return body;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error(`task ${taskId} did not finish`);
}

async function generateImage(userId: string, args: Record<string, unknown>) {
  const r = await api(userId, "/api/generate/image", {
    method: "POST",
    body: JSON.stringify(args)
  });
  const body = r.body as { task_id?: string } | null;
  if (body?.task_id) cleanupTaskIds.add(body.task_id);
  if (r.status !== 200 || !body?.task_id) {
    throw new Error(`generate image failed ${r.status}: ${JSON.stringify(r.body)}`);
  }
  const task = await waitTask(userId, body.task_id);
  if (task.status !== "succeeded") throw new Error(`task not succeeded: ${JSON.stringify(task)}`);
  return one<{
    id: string;
    user_id: string;
    department_id: string;
    credits_cost: string | number;
    cost_cny: string | number;
    type: string;
  }>(
    "SELECT id, user_id, department_id, credits_cost, cost_cny, type FROM generation_tasks WHERE id=$1",
    [body.task_id]
  );
}

async function submitAndApproveReimbursement(userId: string, adminId: string, amount: string) {
  const today = new Date().toISOString().slice(0, 10);
  const fd = new FormData();
  fd.set("tool_name", "Tier3 selftest tool");
  fd.set("amount_cny", amount);
  fd.set("usage_period_start", today);
  fd.set("usage_period_end", today);
  fd.set("purpose_description", "Tier3 selftest reimbursement");
  fd.set("payment_type", "monthly");
  fd.set("attachments", new Blob(["tier3 selftest receipt"], { type: "application/pdf" }), "tier3-receipt.pdf");

  const submit = await api(userId, "/api/reimbursements", { method: "POST", body: fd });
  const submitBody = submit.body as { id?: number } | null;
  if (submit.status !== 200 || !submitBody?.id) {
    throw new Error(`submit reimbursement failed ${submit.status}: ${JSON.stringify(submit.body)}`);
  }
  cleanupReimbIds.add(submitBody.id);

  const approve = await api(adminId, `/api/admin/reimbursements/${submitBody.id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ action: "approve" })
  });
  if (approve.status !== 200) {
    throw new Error(`approve reimbursement failed ${approve.status}: ${JSON.stringify(approve.body)}`);
  }
  return submitBody.id;
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function round2(n: number) {
  return Number(n.toFixed(2));
}

function round4(n: number) {
  return Number(n.toFixed(4));
}

async function cleanup() {
  for (const id of cleanupReimbIds) {
    await db.query("DELETE FROM audit_logs WHERE target_type='reimbursement_request' AND target_id=$1", [String(id)]).catch(() => {});
    await db.query("DELETE FROM reimbursement_requests WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of cleanupTaskIds) {
    await db.query("DELETE FROM prompt_collections WHERE task_id=$1", [id]).catch(() => {});
    await db.query("DELETE FROM generation_results WHERE task_id=$1", [id]).catch(() => {});
    await db.query("DELETE FROM audit_logs WHERE target_type='generation_task' AND target_id=$1", [id]).catch(() => {});
    await db.query("DELETE FROM generation_tasks WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of cleanupConvIds) {
    await db.query("UPDATE conversations SET deleted_at=now() WHERE id=$1 AND is_default=false", [id]).catch(() => {});
  }
}

function writeReport() {
  const row = (id: string, title: string) => {
    const matches = results.filter(r => r.id.startsWith(id));
    const hasFail = matches.some(r => r.status === "FAIL");
    const hasWarn = matches.some(r => r.status === "WARN");
    const status = matches.length === 0 ? "未测" : hasFail ? "失败" : hasWarn ? "部分通过" : "通过";
    const detail = matches.map(r => `${r.id} ${r.status}: ${r.detail || r.name}`).join("; ");
    return `| ${id} | ${title} | ${status} | ${detail.replace(/\r?\n/g, " ")} |`;
  };

  const bugLines = results
    .filter(r => r.status === "FAIL")
    .map((r, i) => `- #${String(i + 5).padStart(2, "0")} ${r.id} ${r.name}: ${r.detail}`);

  const content = `# Tier 3 自测报告

> 范围: \`自测清单.md\` Tier 3
> 执行时间: 2026-06-02
> 环境: localhost:3000, AUTH_MODE=mock, EASYROUTER_MODE=mock

## 结果总览

| 编号 | 测试项 | 状态 | 备注 |
|---|---|---|---|
${row("3.1", "\`/profile\` 本月已用 / 约等于次数")}
${row("3.2", "\`/admin\` KPI 本月调用 / 活跃部门 / 成本")}
${row("3.3", "配额进度条百分比")}
${row("3.4", "\`/manager\` 本部门权限")}
${row("3.5", "报销金额统计")}

## Bug 记录

${bugLines.length ? bugLines.join("\n") : "暂无。"}

## 执行记录

${results.map(r => `- ${r.id} [${r.status}] ${r.name}: ${r.detail}`).join("\n")}
`;
  fs.writeFileSync(REPORT_PATH, content, "utf8");
}

async function main() {
  await db.connect();

  const queries = await import("../../lib/db/queries");
  const {
    getAdminKpi,
    getPersonalUsageDashboard,
    getProfileHeaderStats,
    getDepartmentQuotaSnapshot,
    getReimbursementStats,
    listDeptMemberUsage
  } = queries;

  const [zhangsan, admin, manager, normal, imageModel, tag] = await Promise.all([
    one<{ id: string; department_id: string; monthly_quota_credits: number }>(
      "SELECT id, department_id, monthly_quota_credits FROM users WHERE email='zhangsan@example.com'"
    ),
    one<{ id: string }>("SELECT id FROM users WHERE email='jiabin@example.com'"),
    one<{ id: string; department_id: string; managed_department_ids: string[]; email: string }>(
      "SELECT id, department_id, managed_department_ids, email FROM users WHERE is_dept_manager=true AND email<>'jiabin@example.com' ORDER BY created_at LIMIT 1"
    ),
    one<{ id: string }>(
      "SELECT id FROM users WHERE COALESCE(is_dept_manager,false)=false AND email<>'jiabin@example.com' ORDER BY created_at LIMIT 1"
    ),
    one<{ id: string }>(
      "SELECT id FROM models WHERE type='image' AND enabled=true ORDER BY CASE WHEN provider='mock' THEN 0 ELSE 1 END, is_baseline DESC, priority ASC, sort_order ASC LIMIT 1"
    ),
    one<{ id: string }>(
      "SELECT id FROM purpose_tags WHERE merged_into_id IS NULL ORDER BY sort_order ASC LIMIT 1"
    )
  ]);

  if (!zhangsan || !admin || !imageModel || !tag) {
    throw new Error("required seed user/model/tag missing");
  }

  const conv = await createConversation(zhangsan.id);
  await patchConversation(zhangsan.id, conv.id, { primary_purpose_tag_id: tag.id });
  const baseArgs = {
    model_id: imageModel.id,
    ratio: "1:1",
    purpose_tag_id: tag.id,
    conversation_id: conv.id,
    output_count: 1
  };
  const made = [
    await generateImage(zhangsan.id, { ...baseArgs, prompt: "Tier3 selftest profile image A" }),
    await generateImage(zhangsan.id, { ...baseArgs, prompt: "Tier3 selftest profile image B" })
  ];
  const generated = made.filter(Boolean) as Array<{
    id: string;
    department_id: string;
    credits_cost: string | number;
    cost_cny: string | number;
    type: string;
  }>;
  const testCredits = generated.reduce((s, t) => s + Number(t.credits_cost), 0);
  const testCost = generated.reduce((s, t) => s + Number(t.cost_cny), 0);

  const since = monthStartIso();

  // 3.1 profile: project query function vs independent SQL.
  const profileUsage = await getPersonalUsageDashboard({
    user_id: zhangsan.id,
    department_id: zhangsan.department_id,
    personal_quota_credits: zhangsan.monthly_quota_credits ?? 5000,
    include_dept_overview: false
  });
  const profileHeader = await getProfileHeaderStats({ user_id: zhangsan.id });
  const profileSql = await one<{
    total_count: string | number;
    image_count: string | number;
    used: string | number;
  }>(
    `SELECT COUNT(*) AS total_count,
            COUNT(*) FILTER (WHERE type='image') AS image_count,
            COALESCE(SUM(credits_cost),0) AS used
       FROM generation_tasks
      WHERE user_id=$1 AND status='succeeded' AND created_at >= $2`,
    [zhangsan.id, since]
  );
  record(
    "3.1-a",
    "/profile 本月次数与 SQL 一致",
    Number(profileUsage.total_count) === Number(profileSql?.total_count) &&
      Number(profileUsage.image_count) === Number(profileSql?.image_count)
      ? "PASS"
      : "FAIL",
    `query total=${profileUsage.total_count}/image=${profileUsage.image_count}, sql total=${profileSql?.total_count}/image=${profileSql?.image_count}`
  );
  record(
    "3.1-b",
    "/profile 本月已用额度与 SQL 一致",
    Number(profileUsage.personal_credits_used) === Math.round(Number(profileSql?.used ?? 0))
      ? "PASS"
      : "FAIL",
    `query used=${profileUsage.personal_credits_used}, sql used=${profileSql?.used}, selftestDelta=${testCredits}`
  );
  record(
    "3.1-c",
    "/profile 累计成功次数可取",
    Number(profileHeader.total_succeeded_count) >= Number(profileUsage.total_count) ? "PASS" : "FAIL",
    `header total=${profileHeader.total_succeeded_count}, month total=${profileUsage.total_count}`
  );

  // 3.2 admin KPI.
  const adminKpi = await getAdminKpi("month");
  const adminSql = await one<{
    calls: string | number;
    active_departments: string | number;
    active_users: string | number;
    credits: string | number;
    cost: string | number;
  }>(
    `SELECT COUNT(*) AS calls,
            COUNT(DISTINCT department_id) FILTER (WHERE department_id IS NOT NULL) AS active_departments,
            COUNT(DISTINCT user_id) AS active_users,
            COALESCE(SUM(credits_cost),0) AS credits,
            COALESCE(SUM(cost_cny),0) AS cost
       FROM generation_tasks
      WHERE status='succeeded' AND created_at >= $1`,
    [since]
  );
  record(
    "3.2-a",
    "/admin KPI 本月调用 / 活跃部门 / 活跃员工一致",
    Number(adminKpi.total_calls) === Number(adminSql?.calls) &&
      Number(adminKpi.active_departments) === Number(adminSql?.active_departments) &&
      Number(adminKpi.active_users) === Number(adminSql?.active_users)
      ? "PASS"
      : "FAIL",
    `query calls=${adminKpi.total_calls}, depts=${adminKpi.active_departments}, users=${adminKpi.active_users}; sql calls=${adminSql?.calls}, depts=${adminSql?.active_departments}, users=${adminSql?.active_users}`
  );
  record(
    "3.2-b",
    "/admin KPI 成本 / 积分一致",
    Number(adminKpi.total_credits_consumed) === Math.round(Number(adminSql?.credits ?? 0)) &&
      Number(adminKpi.total_cny) === round4(Number(adminSql?.cost ?? 0))
      ? "PASS"
      : "FAIL",
    `query credits=${adminKpi.total_credits_consumed}, cny=${adminKpi.total_cny}; sql credits=${adminSql?.credits}, cny=${adminSql?.cost}; selftestCost=${testCost}`
  );

  // 3.3 department quota snapshot / progress percent.
  const deptId = zhangsan.department_id;
  const quota = await getDepartmentQuotaSnapshot(deptId);
  const quotaSql = await one<{ used: string | number; limit: string | number }>(
    `SELECT
       COALESCE((SELECT SUM(credits_cost)
                   FROM generation_tasks
                  WHERE department_id=$1 AND status='succeeded' AND created_at >= $2),0) AS used,
       COALESCE((SELECT credits_limit FROM quotas WHERE department_id=$1 AND month=$3 LIMIT 1),5000) AS limit`,
    [deptId, since, since.slice(0, 10)]
  );
  const sqlRatio = Number(quotaSql?.limit) > 0 ? Number(quotaSql?.used) / Number(quotaSql?.limit) : 0;
  record(
    "3.3-a",
    "部门配额 used / limit / ratio 与 SQL 一致",
    Math.round(Number(quota.used_credits)) === Math.round(Number(quotaSql?.used ?? 0)) &&
      Number(quota.limit_credits) === Number(quotaSql?.limit) &&
      Math.abs(Number(quota.ratio) - sqlRatio) < 0.000001
      ? "PASS"
      : "FAIL",
    `query ${quota.used_credits}/${quota.limit_credits} ratio=${quota.ratio.toFixed(4)}, sql ${quotaSql?.used}/${quotaSql?.limit} ratio=${sqlRatio.toFixed(4)}`
  );

  // 3.4 manager scoped dashboard.
  if (!manager) {
    record("3.4-a", "/manager 找到非 admin 部门负责人", "WARN", "种子数据中没有非 admin manager,跳过本部门范围核对");
  } else {
    const managerDeptId = manager.managed_department_ids?.[0] ?? manager.department_id;
    const scopedKpi = await getAdminKpi("month", managerDeptId);
    const scopedSql = await one<{ calls: string | number; users: string | number; credits: string | number }>(
      `SELECT COUNT(*) AS calls,
              COUNT(DISTINCT user_id) AS users,
              COALESCE(SUM(credits_cost),0) AS credits
         FROM generation_tasks
        WHERE status='succeeded' AND department_id=$1 AND created_at >= $2`,
      [managerDeptId, since]
    );
    const members = await listDeptMemberUsage(managerDeptId, "month");
    const memberSql = await all<{ id: string }>("SELECT id FROM users WHERE department_id=$1", [managerDeptId]);
    record(
      "3.4-a",
      "/manager KPI 只统计本部门",
      Number(scopedKpi.total_calls) === Number(scopedSql?.calls) &&
        Number(scopedKpi.active_users) === Number(scopedSql?.users) &&
        Number(scopedKpi.total_credits_consumed) === Math.round(Number(scopedSql?.credits ?? 0))
        ? "PASS"
        : "FAIL",
      `dept=${managerDeptId}, query calls=${scopedKpi.total_calls}/users=${scopedKpi.active_users}/credits=${scopedKpi.total_credits_consumed}, sql calls=${scopedSql?.calls}/users=${scopedSql?.users}/credits=${scopedSql?.credits}`
    );
    record(
      "3.4-b",
      "/manager 成员表只包含本部门成员",
      members.every(m => memberSql.some(u => u.id === m.user_id)) ? "PASS" : "FAIL",
      `members=${members.length}, deptUsers=${memberSql.length}`
    );
    const managerPage = await api(manager.id, "/manager/dashboard");
    record(
      "3.4-c",
      "部门负责人可访问 /manager/dashboard",
      managerPage.status === 200 ? "PASS" : "FAIL",
      `HTTP ${managerPage.status}`
    );
  }
  if (normal) {
    const normalManager = await api(normal.id, "/manager/dashboard");
    record(
      "3.4-d",
      "普通员工访问 /manager/dashboard 会被拦截",
      normalManager.status === 307 || normalManager.status === 303 ? "PASS" : "FAIL",
      `HTTP ${normalManager.status}`
    );
  } else {
    record("3.4-d", "普通员工访问 /manager/dashboard 会被拦截", "WARN", "没有找到普通员工种子账号");
  }

  // 3.5 reimbursement stats.
  const reimbId = await submitAndApproveReimbursement(zhangsan.id, admin.id, "123.45");
  const reimbStats = await getReimbursementStats("month");
  const reimbSql = await one<{ count: string | number; total: string | number }>(
    "SELECT COUNT(*) AS count, COALESCE(SUM(amount_cny),0) AS total FROM reimbursement_requests WHERE status='approved' AND reviewed_at >= $1",
    [since]
  );
  const adminKpiAfterReimb = await getAdminKpi("month");
  record(
    "3.5-a",
    "报销统计 approved 总额 / 笔数与 SQL 一致",
    Number(reimbStats.total_count) === Number(reimbSql?.count) &&
      Number(reimbStats.total_cny) === round2(Number(reimbSql?.total ?? 0))
      ? "PASS"
      : "FAIL",
    `query count=${reimbStats.total_count}, total=${reimbStats.total_cny}; sql count=${reimbSql?.count}, total=${reimbSql?.total}; selftestReimb=${reimbId}`
  );
  record(
    "3.5-b",
    "/admin KPI 报销总额与 SQL 一致",
    Number(adminKpiAfterReimb.total_reimbursement_cny) === round2(Number(reimbSql?.total ?? 0))
      ? "PASS"
      : "FAIL",
    `query reimb=${adminKpiAfterReimb.total_reimbursement_cny}, sql reimb=${reimbSql?.total}`
  );

  // Basic page accessibility for the three dashboard surfaces.
  const profilePage = await page(zhangsan.id, "/profile");
  const adminPage = await page(admin.id, "/admin");
  record("3.page-a", "/profile 页面可访问", profilePage.status === 200 ? "PASS" : "FAIL", `HTTP ${profilePage.status}`);
  record("3.page-b", "/admin 页面可访问", adminPage.status === 200 ? "PASS" : "FAIL", `HTTP ${adminPage.status}`);
}

main()
  .catch(e => {
    record("3.runner", "Tier 3 runner 执行异常", "FAIL", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(e => console.warn(`cleanup warning: ${(e as Error).message}`));
    writeReport();
    await db.end().catch(() => {});
    const failed = results.some(r => r.status === "FAIL");
    if (failed) process.exitCode = 1;
  });
