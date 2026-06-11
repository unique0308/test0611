import fs from "node:fs";
import { Client } from "pg";

const BASE_URL = process.env.SELFTEST_BASE_URL ?? "http://localhost:3000";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const results = [];
const createdTaskIds = [];

function record(id, name, status, detail = "") {
  results.push({ id, name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "!";
  console.log(`${icon} ${id} ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookie(userId) {
  return `auth_mock_user_id=${userId}`;
}

async function api(userId, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Cookie: cookie(userId),
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    },
    redirect: "manual"
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function one(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows[0] ?? null;
}

async function all(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function waitTask(userId, taskId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api(userId, `/api/tasks/${taskId}`);
    if (r.status !== 200) throw new Error(`task ${taskId} poll status ${r.status}`);
    if (["succeeded", "failed", "cancelled"].includes(r.body.status)) return r.body;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error(`task ${taskId} did not finish`);
}

async function createConversation(userId) {
  const r = await api(userId, "/api/conversations", { method: "POST" });
  if (r.status !== 201) throw new Error(`create conversation failed ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.conversation;
}

async function setPrimaryTag(userId, conversationId, tagId) {
  const r = await api(userId, `/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ primary_purpose_tag_id: tagId })
  });
  if (r.status !== 200) throw new Error(`set primary tag failed ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.conversation;
}

async function generateImage(userId, args) {
  const r = await api(userId, "/api/generate/image", {
    method: "POST",
    body: JSON.stringify(args)
  });
  if (r.body?.task_id) createdTaskIds.push(r.body.task_id);
  return r;
}

async function generateSucceededImage(userId, args) {
  const r = await generateImage(userId, args);
  if (r.status !== 200) throw new Error(`image generate failed ${r.status}: ${JSON.stringify(r.body)}`);
  const task = await waitTask(userId, r.body.task_id);
  if (task.status !== "succeeded") throw new Error(`image task not succeeded: ${JSON.stringify(task)}`);
  return task;
}

async function generateVideo(userId, args) {
  const r = await api(userId, "/api/generate/video", {
    method: "POST",
    body: JSON.stringify(args)
  });
  if (r.body?.task_id) createdTaskIds.push(r.body.task_id);
  return r;
}

async function deleteTasks(userId, ids) {
  return api(userId, "/api/tasks/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

async function monthlyUsed(userId) {
  const r = await one(
    `SELECT COALESCE(SUM(credits_cost), 0)::int AS used
     FROM generation_tasks
     WHERE user_id = $1
       AND status = 'succeeded'
       AND created_at >= date_trunc('month', now())`,
    [userId]
  );
  return Number(r.used);
}

async function main() {
  await client.connect();

  const zhangsan = await one("SELECT id, department_id FROM users WHERE email='zhangsan@example.com'");
  const lisi = await one("SELECT id FROM users WHERE email='lisi@example.com'");
  if (!zhangsan || !lisi) throw new Error("seed users missing");

  const imageModel = await one("SELECT id, name FROM models WHERE type='image' AND enabled=true ORDER BY is_baseline DESC, priority ASC, sort_order ASC LIMIT 1");
  const videoModel = await one("SELECT id, name FROM models WHERE type='video' AND enabled=true ORDER BY is_baseline DESC, priority ASC, sort_order ASC LIMIT 1");
  const tags = await all("SELECT id, name, name_normalized FROM purpose_tags WHERE merged_into_id IS NULL ORDER BY sort_order ASC");
  const marketing = tags.find(t => t.name_normalized === "marketing_v2") ?? tags[0];
  const product = tags.find(t => t.name_normalized === "product_v2") ?? tags[1] ?? tags[0];
  const other = tags.find(t => t.name_normalized === "other_v2");
  if (!imageModel || !videoModel || !marketing || !product || !other) throw new Error("models/tags missing");

  const baseImageArgs = {
    model_id: imageModel.id,
    prompt: "Tier1 selftest mock image",
    ratio: "1:1",
    purpose_tag_id: marketing.id,
    output_count: 1
  };

  // 1.2 primary tag blocking
  const noTagConv = await createConversation(zhangsan.id);
  const blocked = await generateImage(zhangsan.id, { ...baseImageArgs, conversation_id: noTagConv.id });
  record(
    "1.2-a",
    "新会话未选主标签时禁止生成",
    blocked.status === 400 && blocked.body?.error?.code === "primary_tag_missing" ? "PASS" : "FAIL",
    `HTTP ${blocked.status}, code=${blocked.body?.error?.code ?? "n/a"}`
  );

  await setPrimaryTag(zhangsan.id, noTagConv.id, marketing.id);
  const taggedTask = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 primary tag selected",
    conversation_id: noTagConv.id
  });
  record("1.2-b", "选择主标签后可以生成", "PASS", `task=${taggedTask.id}`);

  const overrideTask = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 one-shot purpose override",
    conversation_id: noTagConv.id,
    purpose_tag_id: product.id
  });
  const overrideDb = await one("SELECT purpose_tag_id FROM generation_tasks WHERE id=$1", [overrideTask.id]);
  const convDb = await one("SELECT primary_purpose_tag_id FROM conversations WHERE id=$1", [noTagConv.id]);
  record(
    "1.2-c",
    "单次用途覆盖不改变会话主标签",
    overrideDb?.purpose_tag_id === product.id && convDb?.primary_purpose_tag_id === marketing.id ? "PASS" : "FAIL",
    `taskPurpose=${overrideDb?.purpose_tag_id}, convPrimary=${convDb?.primary_purpose_tag_id}`
  );

  const otherConv = await createConversation(zhangsan.id);
  await setPrimaryTag(zhangsan.id, otherConv.id, other.id);
  const longOther = "这是一个超过二十个字的其他用途备注用于测试截断";
  const otherTask = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 other note truncation",
    conversation_id: otherConv.id,
    purpose_tag_id: other.id,
    other_note: longOther
  });
  const audit = await one(
    "SELECT metadata->>'other_note' AS note FROM audit_logs WHERE target_id=$1 AND action='generate_start' ORDER BY created_at DESC LIMIT 1",
    [otherTask.id]
  );
  record(
    "1.2-d",
    "其他用途备注服务端截断到 20 字",
    audit?.note && [...audit.note].length <= 20 ? "PASS" : "FAIL",
    `note=${audit?.note ?? "null"}, length=${audit?.note ? [...audit.note].length : 0}`
  );
  const blankOther = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 blank other note",
    conversation_id: otherConv.id,
    purpose_tag_id: other.id,
    other_note: ""
  });
  record("1.2-e", "其他用途备注留空也能提交", "PASS", `task=${blankOther.id}`);

  // 1.3 generation main paths
  const genConv = await createConversation(zhangsan.id);
  await setPrimaryTag(zhangsan.id, genConv.id, marketing.id);
  const textImage = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 text to image",
    conversation_id: genConv.id
  });
  record("1.3-a", "文生图生成成功", textImage.outputs?.length === 1 ? "PASS" : "FAIL", `outputs=${textImage.outputs?.length ?? 0}`);

  for (const count of [2, 4]) {
    const multi = await generateSucceededImage(zhangsan.id, {
      ...baseImageArgs,
      prompt: `Tier1 multi image ${count}`,
      conversation_id: genConv.id,
      output_count: count
    });
    record(`1.3-b${count}`, `多图 ${count} 张生成成功`, multi.outputs?.length === count ? "PASS" : "FAIL", `outputs=${multi.outputs?.length ?? 0}`);
  }
  const three = await generateImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 multi image 3",
    conversation_id: genConv.id,
    output_count: 3
  });
  record(
    "1.3-b3",
    "多图 3 张生成",
    three.status === 200 ? "PASS" : "FAIL",
    `清单要求 3 张, API 实际 HTTP ${three.status}, message=${three.body?.error?.message ?? "n/a"}`
  );

  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const imageToImage = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 image to image",
    conversation_id: genConv.id,
    reference_image_url: tinyPng
  });
  record("1.3-c", "图生图 PNG 参考图生成成功", imageToImage.reference_image_url ? "PASS" : "FAIL", `reference=${imageToImage.reference_image_url ?? "null"}`);

  for (const duration of [5, 10]) {
    const v = await generateVideo(zhangsan.id, {
      model_id: videoModel.id,
      prompt: `Tier1 text to video ${duration}s`,
      ratio: "16:9",
      duration_seconds: duration,
      purpose_tag_id: marketing.id,
      conversation_id: genConv.id
    });
    record(
      `1.3-d${duration}`,
      `文生视频 ${duration}s 生成成功`,
      v.status === 200 && v.body?.status === "succeeded" && v.body?.file_type?.startsWith("video/") ? "PASS" : "FAIL",
      `HTTP ${v.status}, status=${v.body?.status}, file_type=${v.body?.file_type}`
    );
  }

  const badUpload = await generateImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 bad upload",
    conversation_id: genConv.id,
    reference_image_url: "data:text/plain;base64,SGVsbG8="
  });
  record(
    "1.3-e",
    "非图片参考图友好报错",
    badUpload.status === 400 ? "PASS" : "FAIL",
    `HTTP ${badUpload.status}, message=${badUpload.body?.error?.message ?? "n/a"}`
  );

  const cancelConv = await createConversation(zhangsan.id);
  await setPrimaryTag(zhangsan.id, cancelConv.id, marketing.id);
  const cancelStart = await generateImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 cancellation",
    conversation_id: cancelConv.id
  });
  if (cancelStart.status === 200 && cancelStart.body?.task_id) {
    const cancel = await api(zhangsan.id, `/api/tasks/${cancelStart.body.task_id}`, { method: "DELETE" });
    record(
      "1.3-f",
      "生成中取消",
      cancel.status === 200 && cancel.body?.status === "cancelled" ? "PASS" : "FAIL",
      `HTTP ${cancel.status}, status=${cancel.body?.status ?? "n/a"}`
    );
  } else {
    record("1.3-f", "生成中取消", "FAIL", `生成任务未启动: HTTP ${cancelStart.status}`);
  }

  // 1.1 asset hard delete
  const usedBefore = await monthlyUsed(zhangsan.id);
  const deleteConv = await createConversation(zhangsan.id);
  await setPrimaryTag(zhangsan.id, deleteConv.id, marketing.id);
  const single = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 delete single",
    conversation_id: deleteConv.id
  });
  const usedAfterCreate = await monthlyUsed(zhangsan.id);
  const delSingle = await deleteTasks(zhangsan.id, [single.id]);
  const singleExists = await one("SELECT id FROM generation_tasks WHERE id=$1", [single.id]);
  const usedAfterDelete = await monthlyUsed(zhangsan.id);
  record(
    "1.1-a",
    "删除单个任务后任务消失且本月已用减少",
    delSingle.status === 200 && delSingle.body?.deleted === 1 && !singleExists && usedAfterDelete === usedAfterCreate - Number(single.credits_cost ?? 0) ? "PASS" : "FAIL",
    `deleted=${delSingle.body?.deleted}, used ${usedBefore}->${usedAfterCreate}->${usedAfterDelete}, cost=${single.credits_cost}`
  );

  const batch1 = await generateSucceededImage(zhangsan.id, { ...baseImageArgs, prompt: "Tier1 batch delete 1", conversation_id: deleteConv.id });
  const batch2 = await generateSucceededImage(zhangsan.id, { ...baseImageArgs, prompt: "Tier1 batch delete 2", conversation_id: deleteConv.id });
  const delBatch = await deleteTasks(zhangsan.id, [batch1.id, batch2.id]);
  const batchRemain = await one("SELECT COUNT(*)::int AS c FROM generation_tasks WHERE id = ANY($1::uuid[])", [[batch1.id, batch2.id]]);
  record(
    "1.1-b",
    "批量删除多个任务",
    delBatch.status === 200 && delBatch.body?.deleted === 2 && Number(batchRemain.c) === 0 ? "PASS" : "FAIL",
    `deleted=${delBatch.body?.deleted}, remaining=${batchRemain.c}; 弹窗文案需浏览器确认`
  );

  const collected = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 delete collected",
    conversation_id: deleteConv.id,
    output_count: 4
  });
  const collect = await api(zhangsan.id, "/api/prompts/collect", {
    method: "POST",
    body: JSON.stringify({ task_id: collected.id, output_index: 2 })
  });
  const collectionBefore = await one("SELECT COUNT(*)::int AS c FROM prompt_collections WHERE task_id=$1", [collected.id]);
  const delCollected = await deleteTasks(zhangsan.id, [collected.id]);
  const collectionAfter = await one("SELECT COUNT(*)::int AS c FROM prompt_collections WHERE task_id=$1", [collected.id]);
  const resultsAfter = await one("SELECT COUNT(*)::int AS c FROM generation_results WHERE task_id=$1", [collected.id]);
  record(
    "1.1-c",
    "删除收藏过的任务后收藏与产物解绑清理",
    collect.status === 200 && Number(collectionBefore.c) === 1 && delCollected.body?.deleted === 1 && Number(collectionAfter.c) === 0 && Number(resultsAfter.c) === 0 ? "PASS" : "FAIL",
    `collection ${collectionBefore.c}->${collectionAfter.c}, resultsAfter=${resultsAfter.c}`
  );

  const ownerTask = await generateSucceededImage(zhangsan.id, {
    ...baseImageArgs,
    prompt: "Tier1 permission isolation",
    conversation_id: deleteConv.id
  });
  const lisiList = await api(lisi.id, "/api/tasks?page_size=100");
  const visibleToLisi = lisiList.body?.rows?.some?.(r => r.id === ownerTask.id) ?? false;
  const lisiDelete = await deleteTasks(lisi.id, [ownerTask.id]);
  const ownerStillExists = await one("SELECT id FROM generation_tasks WHERE id=$1", [ownerTask.id]);
  record(
    "1.1-d",
    "切到别的员工看不到且删不到他人任务",
    lisiList.status === 200 && !visibleToLisi && lisiDelete.status === 200 && lisiDelete.body?.deleted === 0 && !!ownerStillExists ? "PASS" : "FAIL",
    `visibleToLisi=${visibleToLisi}, deleteAttempt=${lisiDelete.body?.deleted}`
  );

  // Cleanup last permission task so selftest leaves less residue.
  await deleteTasks(zhangsan.id, [ownerTask.id]);

  await client.end();
  const failed = results.filter(r => r.status === "FAIL");
  console.log("\nSUMMARY");
  console.table(results);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async e => {
  console.error(e);
  try { await client.end(); } catch {}
  process.exitCode = 1;
});

