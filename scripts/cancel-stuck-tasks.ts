/**
 * 列出 / 取消卡住的生成任务(status ∈ queued|running)。
 *
 * 用法:
 *   tsx --env-file=.env.local scripts/cancel-stuck-tasks.ts            # 只列出
 *   tsx --env-file=.env.local scripts/cancel-stuck-tasks.ts --cancel   # 取消全部活跃任务
 *
 * 背景:migration 006 用 partial unique index 限制每个 user 同时只能有 1 个
 *   queued/running 任务。若某次生成异常退出未回写终态,该任务会一直卡住,
 *   后续生成都被「上一个还在生成,请稍后再试」拦截。
 */

import { getServerClient } from "../lib/supabase/server";

async function main() {
  const cancel = process.argv.includes("--cancel");
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("generation_tasks")
    .select("id, user_id, type, status, prompt, created_at")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("查询失败:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("没有处于 queued/running 的活跃任务。");
    return;
  }

  console.log(`发现 ${rows.length} 个活跃任务:`);
  for (const r of rows) {
    const prompt = String(r.prompt ?? "").slice(0, 40);
    console.log(
      `  - ${r.id} | ${r.status} | ${r.type} | ${r.created_at} | ${prompt}`
    );
  }

  if (!cancel) {
    console.log("\n(仅列出。加 --cancel 参数可将以上任务标记为 cancelled。)");
    return;
  }

  const ids = rows.map(r => r.id);
  const { error: updErr } = await supabase
    .from("generation_tasks")
    .update({
      status: "cancelled",
      error_message: "手动取消(卡住任务清理)",
      completed_at: new Date().toISOString()
    })
    .in("id", ids);

  if (updErr) {
    console.error("取消失败:", updErr.message);
    process.exit(1);
  }
  console.log(`\n✓ 已将 ${ids.length} 个任务标记为 cancelled。`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
