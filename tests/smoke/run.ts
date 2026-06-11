/**
 * Smoke test — 9 关键路径
 * MVP: Test 1-5(21 assertions)
 * V1.1 Day 24:Test 6 Prompt 收藏端到端 + Test 7 跨用户隔离
 * V1.2-V1.4 Day 28:Test 8 报销端到端
 * V1.15 Day 28:Test 9 批量下载
 * V1 Week 5 Day 34:Test 10 manager / Test 11 admin tasks / Test 12 admin prompt collections
 *
 * 跑前提:
 *   - dev server 在 BASE_URL 监听(默认 http://localhost:3000)
 *   - DB 已 migration(npm run db:migrate)
 *   - 至少存在 mock 用户嘉斌 / 张三
 *
 * 用法: npm run smoke
 *
 * 退码:0=全过 / 1=任一失败
 */

import { Client } from "pg";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

async function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passCount++;
  } else {
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
    failures.push(`${name}: ${detail ?? "(no detail)"}`);
    failCount++;
  }
}

// Cookie jar — 一个用户一份
function makeJar() {
  const m = new Map<string, string>();
  return {
    fromHeader(setCookie: string | null) {
      if (!setCookie) return;
      for (const part of setCookie.split(/,\s*(?=[\w-]+=)/)) {
        const seg = part.split(";")[0];
        const eq = seg.indexOf("=");
        if (eq > 0) m.set(seg.slice(0, eq).trim(), seg.slice(eq + 1).trim());
      }
    },
    header(): string {
      return [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
  };
}

async function login(userId: string) {
  const jar = makeJar();
  const resp = await fetch(`${BASE}/api/auth/dev/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `user_id=${encodeURIComponent(userId)}`,
    redirect: "manual"
  });
  jar.fromHeader(resp.headers.get("set-cookie"));
  return { jar, status: resp.status };
}

async function main() {
  console.log(`Smoke against ${BASE}\n`);

  // ─── PG 拿 mock 用户 / 模型 / 标签 id ─────────────────────────────────
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const [jiabin, zhangsan, qianqi, zhangsanDept, imgModel, tag] = await Promise.all([
    pg.query("SELECT id, email FROM users WHERE name='嘉斌'"),
    pg.query("SELECT id, managed_department_ids FROM users WHERE name='张三'"),
    pg.query("SELECT id FROM users WHERE name='钱七'"),
    pg.query(
      "SELECT d.id FROM departments d JOIN users u ON u.department_id = d.id WHERE u.name='张三'"
    ),
    pg.query("SELECT id FROM models WHERE provider='mock' AND type='image'"),
    // 023 后 M5 D16 5 新预设上线,旧"营销物料"已 merged → 取新"营销推广"(active)
    pg.query("SELECT id FROM purpose_tags WHERE name='营销推广' AND merged_into_id IS NULL")
  ]);
  const JIABIN_ID = jiabin.rows[0].id;
  const ZHANGSAN_ID = zhangsan.rows[0].id;
  const QIANQI_ID = qianqi.rows[0].id;
  const ZHANGSAN_DEPT_ID =
    (zhangsan.rows[0].managed_department_ids as string[] | null)?.[0] ?? zhangsanDept.rows[0]?.id;
  const OTHER_DEPT_ID = (
    await pg.query("SELECT id FROM departments WHERE name='产品研发部'")
  ).rows[0].id;
  const MOCK_IMG_ID = imgModel.rows[0].id; // 用 mock 模型,smoke 不烧真实 cost
  const TAG_ID = tag.rows[0].id;

  // 024 · M5 P1 波 2 主标签必选 blocking:smoke 模拟"嘉斌已在会话头部选过主标签"
  // 否则 POST /api/generate/image 会被 API 层 enforce 返 400 primary_tag_missing
  // 注:嘉斌默认 conv 在 (main)/layout.tsx ensureDefaultConversation 兜底创建,
  //     smoke Test 1 GET / 触发后必然存在,此处 UPDATE 安全
  const primaryUpd = await pg.query(
    `UPDATE conversations
       SET primary_purpose_tag_id = $1
       WHERE user_id = $2 AND is_default = TRUE AND deleted_at IS NULL
       RETURNING id`,
    [TAG_ID, JIABIN_ID]
  );
  if (primaryUpd.rowCount === 0) {
    console.warn("⚠ 嘉斌 default conv 不存在,首次 smoke 跑 GET / 后再跑此 smoke");
  }

  await pg.end();

  // ─── Test 1: login flow ─────────────────────────────────────────────
  console.log("Test 1: login flow");
  {
    const { jar, status } = await login(JIABIN_ID);
    await assert("POST /api/auth/dev/switch returns 303", status === 303, `got ${status}`);

    const home = await fetch(`${BASE}/`, { headers: { Cookie: jar.header() } });
    await assert("GET / returns 200 after login", home.status === 200);
    const html = await home.text();
    await assert("home shows 嘉斌 name", html.includes("嘉斌"));
    // 2026-05-29 V1 加 B:Sidebar 强制 V1_FORCE_SIDEBAR_COLLAPSED=true,
    // role-pill "管理员" 仅在 !collapsed 时渲染 → SSR HTML 不再含 "管理员",assert 删除
  }

  // ─── Test 2: image generation (mock model so cheap & fast) ─────────
  // 2026-05-28 异步化:POST 立即返 {task_id},status/file_url/credits 需轮询 GET /api/tasks/{id}
  console.log("\nTest 2: image generation via mock provider");
  let lastTaskId = "";
  {
    const { jar } = await login(JIABIN_ID);
    const t0 = Date.now();
    const resp = await fetch(`${BASE}/api/generate/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.header() },
      body: JSON.stringify({
        model_id: MOCK_IMG_ID,
        prompt: "smoke test apple",
        ratio: "1:1",
        purpose_tag_id: TAG_ID
      })
    });
    const initData = await resp.json();
    await assert("POST /api/generate/image 200 (mock model)", resp.status === 200, `got ${resp.status}: ${JSON.stringify(initData).slice(0, 200)}`);
    await assert("returned task_id", typeof initData.task_id === "string");
    lastTaskId = initData.task_id ?? "";

    // 轮询 GET /api/tasks/{id} 直到 succeeded/failed,最多 20 次 × 500ms = 10s
    // (mock provider 同步生成,通常 1-2 次就 succeeded)
    let data: Record<string, unknown> | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const poll = await fetch(`${BASE}/api/tasks/${lastTaskId}`, { headers: { Cookie: jar.header() } });
      data = (await poll.json()) as Record<string, unknown>;
      if (data.status === "succeeded" || data.status === "failed") break;
    }
    const dt = Date.now() - t0;
    await assert("polled status=succeeded", data?.status === "succeeded", `got ${data?.status}: ${data?.error_message ?? ""}`);
    const fileUrl = data?.file_url as string | undefined;
    await assert("returned file_url", typeof fileUrl === "string" && fileUrl.startsWith("/api/files/"));
    await assert("credits_cost > 0", typeof data?.credits_cost === "number" && (data.credits_cost as number) > 0);
    await assert(`elapsed < 10s (was ${dt}ms)`, dt < 10_000);

    // Download
    const file = await fetch(`${BASE}${fileUrl}`, { headers: { Cookie: jar.header() } });
    await assert("GET file_url returns 200", file.status === 200);
    const size = Number(file.headers.get("content-length") ?? "0");
    await assert("file body size > 0", size > 0, `size=${size}`);
  }

  // ─── Test 3: history list contains generated task ─────────────────
  console.log("\nTest 3: history list");
  {
    const { jar } = await login(JIABIN_ID);
    const resp = await fetch(`${BASE}/api/tasks?page=1&page_size=10`, {
      headers: { Cookie: jar.header() }
    });
    await assert("GET /api/tasks returns 200", resp.status === 200);
    const data = await resp.json();
    await assert("rows is array", Array.isArray(data.rows));
    await assert("total > 0", data.total > 0);
    await assert(
      `last task id matches generated (${lastTaskId.slice(0, 8)})`,
      data.rows[0]?.id === lastTaskId
    );
  }

  // ─── Test 4: admin route protection ─────────────────────────────────
  console.log("\nTest 4: admin route protection");
  {
    const adminJar = (await login(JIABIN_ID)).jar;
    const adminResp = await fetch(`${BASE}/admin`, {
      headers: { Cookie: adminJar.header() },
      redirect: "manual"
    });
    await assert("嘉斌 GET /admin returns 200", adminResp.status === 200);

    const zsJar = (await login(ZHANGSAN_ID)).jar;
    const zsResp = await fetch(`${BASE}/admin`, {
      headers: { Cookie: zsJar.header() },
      redirect: "manual"
    });
    await assert(
      "张三 GET /admin returns 307 redirect (forbidden)",
      zsResp.status === 307,
      `got ${zsResp.status}`
    );
    const loc = zsResp.headers.get("location") || "";
    await assert("redirect location contains /?forbidden=admin", loc.includes("forbidden=admin"));

    const zsApiResp = await fetch(`${BASE}/api/admin/quotas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: zsJar.header() },
      body: JSON.stringify({ department_id: "00000000-0000-0000-0000-000000000000", credits_limit: 0 })
    });
    await assert(
      "张三 POST /api/admin/quotas returns 403",
      zsApiResp.status === 403,
      `got ${zsApiResp.status}`
    );
  }

  // ─── Test 5: cross-user task isolation ──────────────────────────────
  console.log("\nTest 5: cross-user task isolation");
  {
    const zsJar = (await login(ZHANGSAN_ID)).jar;
    const resp = await fetch(`${BASE}/api/tasks?page=1&page_size=50`, {
      headers: { Cookie: zsJar.header() }
    });
    const data = await resp.json();
    await assert(
      "张三 GET /api/tasks 看不到嘉斌的 task",
      Array.isArray(data.rows) && !data.rows.some((r: { id: string }) => r.id === lastTaskId)
    );

    // /api/tasks/[id] 跨用户应 403(嘉斌任务张三访问)
    const detailResp = await fetch(`${BASE}/api/tasks/${lastTaskId}`, {
      headers: { Cookie: zsJar.header() }
    });
    await assert(
      "张三 GET /api/tasks/{嘉斌的id} 返回 403",
      detailResp.status === 403,
      `got ${detailResp.status}`
    );
  }

  // ─── Test 6: V1.1 Prompt 收藏端到端 ───────────────────────────────────
  console.log("\nTest 6: V1.1 prompt collect");
  let collectionId = 0;
  {
    const { jar } = await login(JIABIN_ID);
    // 1. POST 创建收藏
    const r1 = await fetch(`${BASE}/api/prompts/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.header() },
      body: JSON.stringify({ task_id: lastTaskId })
    });
    await assert("POST /api/prompts/collect returns 200", r1.status === 200, `got ${r1.status}`);
    const d1 = await r1.json();
    await assert("collection has id + task_id", typeof d1.id === "number" && d1.task_id === lastTaskId);
    collectionId = d1.id;

    // 2. POST 同 task 二次(幂等)
    const r2 = await fetch(`${BASE}/api/prompts/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.header() },
      body: JSON.stringify({ task_id: lastTaskId })
    });
    const d2 = await r2.json();
    await assert("second POST is idempotent (same id)", r2.status === 200 && d2.id === collectionId);

    // 3. GET list 包含
    const r3 = await fetch(`${BASE}/api/prompts/collections`, { headers: { Cookie: jar.header() } });
    const d3 = await r3.json();
    await assert(
      "GET /api/prompts/collections includes new id",
      r3.status === 200 && Array.isArray(d3.rows) && d3.rows.some((r: { id: number }) => r.id === collectionId)
    );

    // 4. GET tasks 反映 collection_id
    const r4 = await fetch(`${BASE}/api/tasks?page=1&page_size=20`, { headers: { Cookie: jar.header() } });
    const d4 = await r4.json();
    await assert(
      "GET /api/tasks shows collection_id for collected task",
      Array.isArray(d4.rows) && d4.rows.find((r: { id: string; collection_id: number | null }) => r.id === lastTaskId)?.collection_id === collectionId
    );

    // 5. GET detail(写 prompt_reuse audit)
    const r5 = await fetch(`${BASE}/api/prompts/collections/${collectionId}`, { headers: { Cookie: jar.header() } });
    await assert("GET /api/prompts/collections/{id} returns 200", r5.status === 200);

    // 6. DELETE
    const r6 = await fetch(`${BASE}/api/prompts/collect/${collectionId}`, {
      method: "DELETE",
      headers: { Cookie: jar.header() }
    });
    await assert("DELETE /api/prompts/collect/{id} returns 200", r6.status === 200);

    // 7. GET tasks 再次反映 collection_id=null
    const r7 = await fetch(`${BASE}/api/tasks?page=1&page_size=20`, { headers: { Cookie: jar.header() } });
    const d7 = await r7.json();
    await assert(
      "GET /api/tasks shows collection_id=null after delete",
      d7.rows.find((r: { id: string; collection_id: number | null }) => r.id === lastTaskId)?.collection_id === null
    );
  }

  // ─── Test 7: V1.1 跨用户隔离 ───────────────────────────────────────────
  console.log("\nTest 7: V1.1 cross-user isolation");
  {
    // 嘉斌先重收一个
    const { jar: jjar } = await login(JIABIN_ID);
    const j1 = await fetch(`${BASE}/api/prompts/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jjar.header() },
      body: JSON.stringify({ task_id: lastTaskId })
    });
    const jc = (await j1.json()).id;

    // 张三 DELETE 嘉斌的 collection → 404
    const { jar: zjar } = await login(ZHANGSAN_ID);
    const r1 = await fetch(`${BASE}/api/prompts/collect/${jc}`, {
      method: "DELETE",
      headers: { Cookie: zjar.header() }
    });
    await assert("张三 DELETE 嘉斌的 collection 返回 404", r1.status === 404, `got ${r1.status}`);

    // 张三 GET 嘉斌的 collection detail → 404
    const r2 = await fetch(`${BASE}/api/prompts/collections/${jc}`, { headers: { Cookie: zjar.header() } });
    await assert("张三 GET 嘉斌的 collection detail 返回 404", r2.status === 404, `got ${r2.status}`);

    // 张三 POST 收嘉斌的 task → 404
    const r3 = await fetch(`${BASE}/api/prompts/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: zjar.header() },
      body: JSON.stringify({ task_id: lastTaskId })
    });
    await assert("张三 POST 收嘉斌的 task 返回 404", r3.status === 404, `got ${r3.status}`);

    // 清理:嘉斌删自己
    await fetch(`${BASE}/api/prompts/collect/${jc}`, { method: "DELETE", headers: { Cookie: jjar.header() } });
  }

  // ─── Test 8: V1.2-V1.4 报销端到端 ────────────────────────────────────
  console.log("\nTest 8: V1.2-V1.4 reimbursement");
  let reimbId = 0;
  {
    // 8.1 张三 POST 提交报销(multipart)
    const { jar: zjar } = await login(ZHANGSAN_ID);
    const fd = new FormData();
    fd.set("tool_name", "Cursor");
    fd.set("amount_cny", "299");
    fd.set("usage_period_start", "2026-05-01");
    fd.set("usage_period_end", "2026-05-31");
    fd.set("purpose_description", "smoke test 报销");
    fd.set("payment_type", "monthly");
    fd.set("attachments", new Blob(["fake-pdf-content"], { type: "application/pdf" }), "receipt.pdf");
    const r1 = await fetch(`${BASE}/api/reimbursements`, {
      method: "POST",
      headers: { Cookie: zjar.header() },
      body: fd
    });
    await assert("POST /api/reimbursements 返 200", r1.status === 200, `got ${r1.status}`);
    const d1 = await r1.json();
    await assert("request_number 格式 R-XXXX", /^R-\d{4}$/.test(d1.request_number), `got ${d1.request_number}`);
    await assert("status=pending", d1.status === "pending");
    reimbId = d1.id;

    // 8.2 张三 GET list 只看到自己
    const r2 = await fetch(`${BASE}/api/reimbursements`, { headers: { Cookie: zjar.header() } });
    const d2 = await r2.json();
    await assert("张三 GET reimb list 含自己的", Array.isArray(d2.rows) && d2.rows.some((r: { id: number }) => r.id === reimbId));

    // 8.3 单笔超限 ¥2001 → 422
    const fd2 = new FormData();
    fd2.set("tool_name", "Test");
    fd2.set("amount_cny", "2001");
    fd2.set("usage_period_start", "2026-05-01");
    fd2.set("usage_period_end", "2026-05-31");
    fd2.set("purpose_description", "test");
    fd2.set("payment_type", "monthly");
    fd2.set("attachments", new Blob(["x"], { type: "application/pdf" }), "x.pdf");
    const r3 = await fetch(`${BASE}/api/reimbursements`, {
      method: "POST",
      headers: { Cookie: zjar.header() },
      body: fd2
    });
    await assert("单笔 ¥2001 返 422", r3.status === 422, `got ${r3.status}`);

    // 8.4 张三非 admin 调 PATCH 审核 → 307 redirect
    const r4 = await fetch(`${BASE}/api/admin/reimbursements/${reimbId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: zjar.header() },
      body: JSON.stringify({ action: "approve" }),
      redirect: "manual"
    });
    await assert("张三 PATCH admin review 返 307", r4.status === 307, `got ${r4.status}`);

    // 8.5 admin 嘉斌 GET 列表看全部
    const { jar: jjar } = await login(JIABIN_ID);
    const r5 = await fetch(`${BASE}/api/reimbursements`, { headers: { Cookie: jjar.header() } });
    const d5 = await r5.json();
    await assert("admin 嘉斌 GET reimb list 含张三的", d5.rows.some((r: { id: number; user_id: string }) => r.id === reimbId && r.user_id === ZHANGSAN_ID));

    // 8.6 admin reject 无 comment → 422
    const r6 = await fetch(`${BASE}/api/admin/reimbursements/${reimbId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: jjar.header() },
      body: JSON.stringify({ action: "reject" })
    });
    await assert("admin reject 无 comment 返 422", r6.status === 422, `got ${r6.status}`);

    // 8.7 admin approve 成功
    const r7 = await fetch(`${BASE}/api/admin/reimbursements/${reimbId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: jjar.header() },
      body: JSON.stringify({ action: "approve" })
    });
    await assert("admin approve 返 200", r7.status === 200);
    const d7 = await r7.json();
    await assert("status 变 approved", d7.status === "approved");

    // 8.8 重复审核 → 409
    const r8 = await fetch(`${BASE}/api/admin/reimbursements/${reimbId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: jjar.header() },
      body: JSON.stringify({ action: "reject", comment: "反悔" })
    });
    await assert("重复审核已 approved 返 409", r8.status === 409, `got ${r8.status}`);
  }

  // ─── Test 9: V1.15 批量下载 ────────────────────────────────────────────
  console.log("\nTest 9: V1.15 batch download");
  {
    // 9.1 嘉斌取自己的 succeeded tasks
    const { jar: jjar } = await login(JIABIN_ID);
    const list = await fetch(`${BASE}/api/tasks?page=1&page_size=20`, { headers: { Cookie: jjar.header() } });
    const d = await list.json();
    const ids = (d.rows as Array<{ id: string; status: string; type: string }>)
      .filter(r => r.status === "succeeded")
      .map(r => r.id)
      .slice(0, 2);
    await assert("有 ≥ 1 个 succeeded task 用于打包", ids.length >= 1);

    // 9.2 正常下载:Content-Type + Content-Length > 0
    const r1 = await fetch(`${BASE}/api/tasks/batch-download?ids=${ids.join(",")}`, {
      headers: { Cookie: jjar.header() }
    });
    await assert("batch-download 返 200", r1.status === 200, `got ${r1.status}`);
    await assert("Content-Type 是 application/zip", r1.headers.get("content-type") === "application/zip");
    const cl = Number(r1.headers.get("content-length") ?? "0");
    await assert("Content-Length > 0", cl > 0, `got ${cl}`);
    // 校验 zip 文件头 PK\x03\x04
    const buf = await r1.arrayBuffer();
    const bytes = new Uint8Array(buf);
    await assert(
      "zip magic bytes 'PK\\x03\\x04'",
      bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    );

    // 9.3 空 ids → 400
    const r2 = await fetch(`${BASE}/api/tasks/batch-download?ids=`, { headers: { Cookie: jjar.header() } });
    await assert("空 ids 返 400", r2.status === 400, `got ${r2.status}`);

    // 9.4 不存在的 id → 404
    const r3 = await fetch(`${BASE}/api/tasks/batch-download?ids=00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: jjar.header() }
    });
    await assert("不存在的 id 返 404", r3.status === 404, `got ${r3.status}`);

    // 9.5 跨用户:张三尝试下载嘉斌的 task → 403
    const { jar: zjar } = await login(ZHANGSAN_ID);
    const r4 = await fetch(`${BASE}/api/tasks/batch-download?ids=${ids[0]}`, {
      headers: { Cookie: zjar.header() }
    });
    await assert("张三 下载嘉斌 task 返 403", r4.status === 403, `got ${r4.status}`);
  }

  // ─── Test 10: V1.5 部门负责人 ─────────────────────────────────────────
  console.log("\nTest 10: V1.5 manager dashboard + quota");
  {
    const { jar: zjar } = await login(ZHANGSAN_ID);
    const dash = await fetch(`${BASE}/manager/dashboard`, {
      headers: { Cookie: zjar.header() },
      redirect: "manual"
    });
    await assert("张三 GET /manager/dashboard 200", dash.status === 200, `got ${dash.status}`);
    const dashHtml = await dash.text();
    await assert("manager 页含部门看板", dashHtml.includes("部门看板"));

    const { jar: qjar } = await login(QIANQI_ID);
    const forbidden = await fetch(`${BASE}/manager/dashboard`, {
      headers: { Cookie: qjar.header() },
      redirect: "manual"
    });
    await assert("钱七 GET /manager/dashboard 307", forbidden.status === 307, `got ${forbidden.status}`);
    const forbiddenLoc = forbidden.headers.get("location") || "";
    await assert("redirect 含 forbidden=manager", forbiddenLoc.includes("forbidden=manager"));

    const patchOk = await fetch(`${BASE}/api/manager/quotas/${ZHANGSAN_DEPT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: zjar.header() },
      body: JSON.stringify({ credits_limit: 5500 })
    });
    await assert("张三 PATCH 本部门配额 200", patchOk.status === 200, `got ${patchOk.status}`);
    const patchBody = await patchOk.json();
    await assert("PATCH 返回 new_limit", patchBody.new_limit === 5500);

    const patchOther = await fetch(`${BASE}/api/manager/quotas/${OTHER_DEPT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: zjar.header() },
      body: JSON.stringify({ credits_limit: 6000 }),
      redirect: "manual"
    });
    await assert("张三 PATCH 他部门配额 307", patchOther.status === 307, `got ${patchOther.status}`);

    const patchOver = await fetch(`${BASE}/api/manager/quotas/${ZHANGSAN_DEPT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: zjar.header() },
      body: JSON.stringify({ credits_limit: 10001 })
    });
    await assert("配额超上限 10001 返 422", patchOver.status === 422, `got ${patchOver.status}`);

    const { jar: jjar } = await login(JIABIN_ID);
    const adminPatch = await fetch(`${BASE}/api/manager/quotas/${OTHER_DEPT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: jjar.header() },
      body: JSON.stringify({ credits_limit: 5000 })
    });
    await assert("嘉斌 admin PATCH 任意部门 200", adminPatch.status === 200, `got ${adminPatch.status}`);
  }

  // ─── Test 11: V1.7 admin 任务记录 ─────────────────────────────────────
  console.log("\nTest 11: V1.7 admin task records");
  {
    const { jar: jjar } = await login(JIABIN_ID);
    const r1 = await fetch(`${BASE}/api/admin/tasks?page=1&page_size=10`, {
      headers: { Cookie: jjar.header() }
    });
    await assert("admin GET /api/admin/tasks 200", r1.status === 200, `got ${r1.status}`);
    const d1 = await r1.json();
    await assert("tasks 有 rows 数组", Array.isArray(d1.rows));
    await assert("tasks total >= 1", typeof d1.total === "number" && d1.total >= 1);
    await assert(
      "task row 含 user_name + prompt",
      d1.rows.length === 0 ||
        (typeof d1.rows[0].user_name === "string" && typeof d1.rows[0].prompt === "string")
    );

    const r2 = await fetch(`${BASE}/api/admin/tasks/export?page=1&page_size=5`, {
      headers: { Cookie: jjar.header() }
    });
    await assert("admin CSV export 200", r2.status === 200, `got ${r2.status}`);
    await assert(
      "export Content-Type 含 text/csv",
      (r2.headers.get("content-type") ?? "").includes("text/csv")
    );
    // fetch.text() 按 WHATWG spec 自动 strip UTF-8 BOM(0xEF 0xBB 0xBF advance 3 bytes),
    // client 拿到的 string 永远不含 BOM;改用 arrayBuffer 检查 raw 字节才能验 BOM 真写入了
    const csvBytes = new Uint8Array(await r2.arrayBuffer());
    await assert(
      "CSV 含 UTF-8 BOM",
      csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf
    );

    const { jar: zjar } = await login(ZHANGSAN_ID);
    const r3 = await fetch(`${BASE}/api/admin/tasks`, {
      headers: { Cookie: zjar.header() },
      redirect: "manual"
    });
    await assert("张三 GET /api/admin/tasks 307", r3.status === 307, `got ${r3.status}`);
  }

  // ─── Test 12: V1.8 admin Prompt 收藏监控 ───────────────────────────────
  console.log("\nTest 12: V1.8 admin prompt collections");
  {
    const { jar: jjar } = await login(JIABIN_ID);
    const r1 = await fetch(`${BASE}/api/admin/prompt-collections?page=1&page_size=12`, {
      headers: { Cookie: jjar.header() }
    });
    await assert("admin GET prompt-collections 200", r1.status === 200, `got ${r1.status}`);
    const d1 = await r1.json();
    await assert("collections 有 stats", d1.stats && typeof d1.stats.total === "number");
    await assert("collections rows 是数组", Array.isArray(d1.rows));
    await assert(
      "collection row 含 prompt_text + user_name",
      d1.rows.length === 0 ||
        (typeof d1.rows[0].prompt_text === "string" && typeof d1.rows[0].user_name === "string")
    );

    const adminPage = await fetch(`${BASE}/admin`, {
      headers: { Cookie: jjar.header() }
    });
    const adminHtml = await adminPage.text();
    await assert("admin 页含 Prompt 收藏监控 tab", adminHtml.includes("Prompt 收藏监控"));

    const { jar: zjar } = await login(ZHANGSAN_ID);
    const r2 = await fetch(`${BASE}/api/admin/prompt-collections`, {
      headers: { Cookie: zjar.header() },
      redirect: "manual"
    });
    await assert("张三 GET prompt-collections 307", r2.status === 307, `got ${r2.status}`);
  }

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Total: ${passCount + failCount}  |  Pass: ${passCount}  |  Fail: ${failCount}`);
  if (failCount > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\n✓ All smoke checks passed");
}

main().catch(err => {
  console.error("Smoke runner crashed:", err);
  process.exit(2);
});
