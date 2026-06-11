/**
 * Smoke test for the model aggregator client (lib/easyrouter, provider-based).
 *
 * Picks defaults based on EASYROUTER_MODE:
 *   - mock:      provider=mock,         model=mock-image-1024 / mock-video-1024
 *   - real:      provider=openrouter,   model=google/gemini-2.5-flash-image
 *                provider=volcengine,   model=seedance-2-0-fast(expected throw — key not set)
 *
 * Output:
 *   /tmp/smoke-image-<task_id>.<ext> + /tmp/smoke-video-<task_id>.<ext>
 *
 * Usage: npm run model:smoke
 */

import { writeFile } from "node:fs/promises";
// client.ts 仅在函数被调用时读 env,静态 import 顺序无关
import {
  generateImage,
  generateVideo,
  GenerationError,
  type Provider
} from "@/lib/easyrouter";

const PROMPT = "a serene mountain landscape at sunset, painterly oil style, soft warm light";

function defaults() {
  const isMock = process.env.EASYROUTER_MODE === "mock";
  return {
    isMock,
    imageProvider: (isMock ? "mock" : "openrouter") as Provider,
    imageModel: isMock ? "mock-image-1024" : "google/gemini-2.5-flash-image",
    videoProvider: (isMock ? "mock" : "volcengine") as Provider,
    videoModel: isMock ? "mock-video-1024" : "seedance-2-0-fast"
  };
}

async function happyPath() {
  const { imageProvider, imageModel } = defaults();
  console.log(
    `--- Test 1: image via ${imageProvider} (${imageModel}, 1:1, EASYROUTER_MODE=${process.env.EASYROUTER_MODE}) ---`
  );
  const t0 = Date.now();
  const r = await generateImage({
    provider: imageProvider,
    model: imageModel,
    prompt: PROMPT,
    ratio: "1:1"
  });
  const dt = Date.now() - t0;
  console.log(`  task_id:       ${r.task_id}`);
  console.log(`  status:        ${r.status}`);
  console.log(`  image_format:  ${r.image_format}`);
  console.log(`  image_b64.len: ${r.image_b64?.length ?? 0}`);
  console.log(`  cost_cny:      ${r.cost_cny ?? "(unknown, Route Handler estimates from models.credits_per_unit)"}`);
  console.log(`  usage:         ${JSON.stringify(r.raw_usage).slice(0, 200)}`);
  console.log(`  elapsed_ms:    ${dt}`);

  if (r.status !== "succeeded" || !r.image_b64) throw new Error("expected success with b64 body");

  const outPath = `/tmp/smoke-image-${r.task_id}.${r.image_format ?? "png"}`;
  await writeFile(outPath, Buffer.from(r.image_b64, "base64"));
  console.log(`  saved: ${outPath}`);
}

async function expectedFailure() {
  const { isMock } = defaults();
  if (isMock) {
    console.log("\n--- Test 2: skipped in mock mode (error classification needs real upstream) ---");
    return;
  }
  console.log("\n--- Test 2: invalid model id (openrouter, expected model_unavailable) ---");
  try {
    await generateImage({
      provider: "openrouter",
      model: "bytedance/seedance-2-0-fast", // 已知 OpenRouter 没有
      prompt: PROMPT,
      ratio: "1:1"
    });
    throw new Error("expected to throw but did not");
  } catch (e: unknown) {
    if (e instanceof GenerationError) {
      console.log(`  code:        ${e.code}`);
      console.log(`  httpStatus:  ${e.httpStatus}`);
      console.log(`  message:     ${e.message.slice(0, 160)}`);
      if (e.code !== "model_unavailable") {
        console.warn(`  ⚠ classification expected model_unavailable, got ${e.code}`);
      }
    } else {
      throw e;
    }
  }
}

async function videoCase() {
  const { isMock, videoProvider, videoModel } = defaults();
  console.log(
    `\n--- Test 3: video via ${videoProvider} (${videoModel}, 9:16, 5s, EASYROUTER_MODE=${process.env.EASYROUTER_MODE}) ---`
  );
  try {
    const t0 = Date.now();
    const r = await generateVideo({
      provider: videoProvider,
      model: videoModel,
      prompt: PROMPT,
      ratio: "9:16",
      duration_seconds: 5
    });
    const dt = Date.now() - t0;
    console.log(`  task_id:       ${r.task_id}`);
    console.log(`  status:        ${r.status}`);
    console.log(`  image_format:  ${r.image_format}`);
    console.log(`  cost_cny:      ${r.cost_cny}`);
    console.log(`  elapsed_ms:    ${dt}`);
    if (r.status === "succeeded" && r.image_b64) {
      const outPath = `/tmp/smoke-video-${r.task_id}.${r.image_format ?? "svg"}`;
      await writeFile(outPath, Buffer.from(r.image_b64, "base64"));
      console.log(`  saved: ${outPath}`);
    }
  } catch (e: unknown) {
    if (!isMock && e instanceof GenerationError && e.code === "model_unavailable") {
      console.log(`  expected fail in real mode (volcengine key not set): ${e.message.slice(0, 120)}`);
    } else {
      throw e;
    }
  }
}

async function main() {
  await happyPath();
  await expectedFailure();
  await videoCase();
  console.log("\n✓ All smoke checks finished");
}

main().catch(err => {
  console.error("✗ Smoke failed:", err);
  process.exit(1);
});
