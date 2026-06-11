import fs from "node:fs";
import { Client } from "pg";

const BASE_URL = process.env.SELFTEST_BASE_URL ?? "http://localhost:3000";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const results = [];
const cleanupTaskIds = new Set();
const cleanupConvIds = new Set();
const cleanupCollectionIds = new Set();

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
      ...(options.body ? { "Content-Type": "application/json" } : {}),
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
  const r = await db.query(sql, params);
  return r.rows[0] ?? null;
}

async function all(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows;
}

async function createConversation(userId) {
  const r = await api(userId, "/api/conversations", { method: "POST" });
  if (r.status !== 201) throw new Error(`create conversation failed ${r.status}: ${JSON.stringify(r.body)}`);
  cleanupConvIds.add(r.body.conversation.id);
  return r.body.conversation;
}

async function patchConversation(userId, id, body) {
  return api(userId, `/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function deleteConversation(userId, id) {
  return api(userId, `/api/conversations/${id}`, { method: "DELETE" });
}

async function waitTask(userId, taskId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api(userId, `/api/tasks/${taskId}`);
    if (r.status !== 200) throw new Error(`task poll failed ${r.status}`);
    if (["succeeded", "failed", "cancelled"].includes(r.body.status)) return r.body;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error(`task ${taskId} did not finish`);
}

async function generateImage(userId, args) {
  const r = await api(userId, "/api/generate/image", {
    method: "POST",
    body: JSON.stringify(args)
  });
  if (r.body?.task_id) cleanupTaskIds.add(r.body.task_id);
  if (r.status !== 200) throw new Error(`generate image failed ${r.status}: ${JSON.stringify(r.body)}`);
  const task = await waitTask(userId, r.body.task_id);
  if (task.status !== "succeeded") throw new Error(`task not succeeded: ${JSON.stringify(task)}`);
  return task;
}

async function collect(userId, taskId, outputIndex = 0) {
  const r = await api(userId, "/api/prompts/collect", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, output_index: outputIndex })
  });
  if (r.body?.id) cleanupCollectionIds.add(r.body.id);
  return r;
}

async function listTasks(userId, query = "") {
  return api(userId, `/api/tasks${query}`);
}

async function cleanup(userId) {
  for (const id of cleanupCollectionIds) {
    await db.query("DELETE FROM prompt_collections WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of cleanupTaskIds) {
    await api(userId, "/api/tasks/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids: [id] })
    }).catch(() => {});
  }
  for (const id of cleanupConvIds) {
    await db.query("UPDATE conversations SET deleted_at = now() WHERE id=$1 AND is_default=false", [id]).catch(() => {});
  }
}

async function main() {
  await db.connect();

  const user = await one("SELECT id FROM users WHERE email='zhangsan@example.com'");
  if (!user) throw new Error("zhangsan missing");

  const imageModel = await one("SELECT id FROM models WHERE type='image' AND enabled=true ORDER BY is_baseline DESC, priority ASC, sort_order ASC LIMIT 1");
  const tag = await one("SELECT id FROM purpose_tags WHERE merged_into_id IS NULL ORDER BY sort_order ASC LIMIT 1");
  if (!imageModel || !tag) throw new Error("model/tag missing");

  const baseArgs = {
    model_id: imageModel.id,
    prompt: "Tier2 selftest",
    ratio: "1:1",
    purpose_tag_id: tag.id,
    output_count: 1
  };

  // 2.1 会话刷新/跨标签: API layer verifies persisted feed and second reader sees same tasks.
  const conv = await createConversation(user.id);
  await patchConversation(user.id, conv.id, { primary_purpose_tag_id: tag.id });
  const t1 = await generateImage(user.id, { ...baseArgs, prompt: "Tier2 conversation persist A", conversation_id: conv.id });
  const t2 = await generateImage(user.id, { ...baseArgs, prompt: "Tier2 conversation persist B", conversation_id: conv.id });
  const dbTasks = await all("SELECT id FROM generation_tasks WHERE conversation_id=$1 AND status='succeeded' ORDER BY created_at", [conv.id]);
  record(
    "2.1-a",
    "生成几条后刷新 feed 仍在",
    dbTasks.some(r => r.id === t1.id) && dbTasks.some(r => r.id === t2.id) ? "PASS" : "FAIL",
    `dbTasks=${dbTasks.length}`
  );
  const convPageBefore = await api(user.id, `/api/conversations`);
  const latestContains = convPageBefore.body?.conversations?.some?.(c => c.id === conv.id) ?? false;
  record(
    "2.1-b",
    "同一会话跨页面/标签可读取到",
    convPageBefore.status === 200 && latestContains ? "PASS" : "FAIL",
    `listed=${latestContains}`
  );

  // 新建会话空态.
  const emptyConv = await createConversation(user.id);
  const emptyTasks = await one("SELECT COUNT(*)::int AS c FROM generation_tasks WHERE conversation_id=$1", [emptyConv.id]);
  record(
    "2.1-c",
    "创建新对话进入空会话",
    Number(emptyTasks.c) === 0 && emptyConv.name === "" ? "PASS" : "FAIL",
    `name='${emptyConv.name}', taskCount=${emptyTasks.c}`
  );

  // Rename edge inputs.
  const longName = "😀Tier2超长会话名称带换行\nabcdefghijklmnopqrstuvwxyz1234567890";
  const rename = await patchConversation(user.id, emptyConv.id, { name: longName });
  const renamed = await one("SELECT name FROM conversations WHERE id=$1", [emptyConv.id]);
  const noNewline = !(renamed?.name ?? "").includes("\n");
  record(
    "2.1-d",
    "会话重命名 emoji/超长/换行不崩",
    rename.status === 200 && renamed?.name && noNewline && [...renamed.name].length <= 18 ? "PASS" : "FAIL",
    `HTTP ${rename.status}, saved='${renamed?.name ?? ""}', length=${renamed?.name ? [...renamed.name].length : 0}`
  );

  // Default conversation locked.
  const def = await one("SELECT id FROM conversations WHERE user_id=$1 AND is_default=true AND deleted_at IS NULL LIMIT 1", [user.id]);
  const defRename = await patchConversation(user.id, def.id, { name: "should not rename" });
  const defPin = await patchConversation(user.id, def.id, { pinned: true });
  const defDelete = await deleteConversation(user.id, def.id);
  record(
    "2.1-e",
    "默认创作不能删/改名/置顶",
    defRename.status === 403 && defPin.status === 403 && defDelete.status === 403 ? "PASS" : "FAIL",
    `rename=${defRename.status}, pin=${defPin.status}, delete=${defDelete.status}`
  );

  // Pin ordering.
  const pinA = await createConversation(user.id);
  const pinB = await createConversation(user.id);
  await patchConversation(user.id, pinA.id, { primary_purpose_tag_id: tag.id });
  await patchConversation(user.id, pinB.id, { primary_purpose_tag_id: tag.id });
  await patchConversation(user.id, pinA.id, { name: "Tier2 pin A" });
  await patchConversation(user.id, pinB.id, { name: "Tier2 pin B" });
  await generateImage(user.id, { ...baseArgs, prompt: "Tier2 pin A task", conversation_id: pinA.id });
  await generateImage(user.id, { ...baseArgs, prompt: "Tier2 pin B task", conversation_id: pinB.id });
  const pinResA = await patchConversation(user.id, pinA.id, { pinned: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const pinResB = await patchConversation(user.id, pinB.id, { pinned: true });
  const listAfterPin = await api(user.id, "/api/conversations");
  const nonDefault = listAfterPin.body?.conversations?.filter?.(c => !c.is_default) ?? [];
  record(
    "2.1-f",
    "置顶会话在列表最上且多个按置顶时间排",
    pinResA.status === 200 && pinResB.status === 200 && nonDefault[0]?.id === pinB.id && nonDefault[1]?.id === pinA.id ? "PASS" : "FAIL",
    `top=${nonDefault[0]?.name ?? "n/a"}, second=${nonDefault[1]?.name ?? "n/a"}`
  );

  // Delete conversation with collection should not delete collection/task.
  const delConv = await createConversation(user.id);
  await patchConversation(user.id, delConv.id, { primary_purpose_tag_id: tag.id });
  const delTask = await generateImage(user.id, { ...baseArgs, prompt: "Tier2 delete conversation keep collection", conversation_id: delConv.id });
  const col = await collect(user.id, delTask.id, 0);
  const delConvRes = await deleteConversation(user.id, delConv.id);
  cleanupConvIds.delete(delConv.id);
  const delConvDb = await one("SELECT deleted_at FROM conversations WHERE id=$1", [delConv.id]);
  const taskAfterConvDelete = await one("SELECT id, conversation_id FROM generation_tasks WHERE id=$1", [delTask.id]);
  const colAfterConvDelete = await one("SELECT id FROM prompt_collections WHERE id=$1", [col.body?.id]);
  record(
    "2.1-g",
    "删除会话不应导致收藏死亡",
    delConvRes.status === 200 && !!delConvDb?.deleted_at && !!taskAfterConvDelete && !!colAfterConvDelete ? "PASS" : "FAIL",
    `delete=${delConvRes.status}, collectionExists=${!!colAfterConvDelete}`
  );

  // 2.2 output-level collections.
  const collConv = await createConversation(user.id);
  await patchConversation(user.id, collConv.id, { primary_purpose_tag_id: tag.id });
  const four = await generateImage(user.id, {
    ...baseArgs,
    prompt: "Tier2 collect output index 2",
    conversation_id: collConv.id,
    output_count: 4
  });
  const c3 = await collect(user.id, four.id, 2);
  const rows = await all("SELECT output_index FROM prompt_collections WHERE task_id=$1 ORDER BY output_index", [four.id]);
  record(
    "2.2-a",
    "4 图任务收藏第 3 张只收藏单张",
    c3.status === 200 && rows.length === 1 && rows[0].output_index === 2 ? "PASS" : "FAIL",
    `indices=${rows.map(r => r.output_index).join(",")}`
  );

  const collectedTasks = await listTasks(user.id, "?collected=true&page_size=100");
  const filtered = collectedTasks.body?.rows?.filter?.(r => r.id === four.id) ?? [];
  const targetOutputs = filtered[0]?.outputs ?? [];
  const collectedOutputs = targetOutputs.filter(o => o.collection_id != null);
  record(
    "2.2-b",
    "资产页我的收藏筛选包含该任务且只标记第 3 张",
    collectedTasks.status === 200 && filtered.length === 1 && collectedOutputs.length === 1 && collectedOutputs[0].output_index === 2 ? "PASS" : "FAIL",
    `taskRows=${filtered.length}, collectedOutputs=${collectedOutputs.map(o => o.output_index).join(",")}`
  );

  const deleteCollection = await db.query("DELETE FROM prompt_collections WHERE id=$1 AND user_id=$2 RETURNING id", [c3.body.id, user.id]);
  cleanupCollectionIds.delete(c3.body.id);
  const afterUncollectTasks = await listTasks(user.id, "?collected=true&page_size=100");
  const stillCollected = afterUncollectTasks.body?.rows?.some?.(r => r.id === four.id) ?? false;
  record(
    "2.2-c",
    "取消收藏后收藏筛选不再显示",
    deleteCollection.rowCount === 1 && !stillCollected ? "PASS" : "FAIL",
    `deleted=${deleteCollection.rowCount}, stillCollected=${stillCollected}`
  );

  const c0 = await collect(user.id, four.id, 0);
  const listNormal = await listTasks(user.id, "?page_size=100");
  const normalTask = listNormal.body?.rows?.find?.(r => r.id === four.id);
  const output0CollectionId = normalTask?.outputs?.find?.(o => o.output_index === 0)?.collection_id ?? null;
  record(
    "2.2-d",
    "列表视图首张 output 0 收藏状态与数据一致",
    c0.status === 200 && output0CollectionId === c0.body.id ? "PASS" : "FAIL",
    `apiCollection=${c0.body?.id}, output0Collection=${output0CollectionId}`
  );

  await cleanup(user.id);
  await db.end();

  console.log("\nSUMMARY");
  console.table(results);
  if (results.some(r => r.status === "FAIL")) process.exitCode = 1;
}

main().catch(async e => {
  console.error(e);
  try { await cleanup((await one("SELECT id FROM users WHERE email='zhangsan@example.com'"))?.id); } catch {}
  try { await db.end(); } catch {}
  process.exitCode = 1;
});
