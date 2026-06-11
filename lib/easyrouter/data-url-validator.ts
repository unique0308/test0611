// data URL 校验 + 解码:image route / video route 共用
// 历史坑:别用 /^data:image\/(png|jpe?g|webp);base64,(.+)$/.match() —— 大 base64
// 字符串会让 V8 正则栈深爆掉(RangeError: Maximum call stack size exceeded)。
// 改成 startsWith + indexOf 切片,正则只校验短 header。

const HEADER_RE = /^data:image\/(png|jpe?g|webp);base64$/;
const MAX_SIZE = 20 * 1024 * 1024;

export type DataUrlMeta = { ext: string; size: number; mime: string; buffer: Buffer };
export type DataUrlValidationResult = DataUrlMeta | { error: string };

export function validateAndDecodeDataUrl(s: unknown): DataUrlValidationResult {
  if (typeof s !== "string") return { error: "reference_image_url 必须是字符串" };
  if (!s.startsWith("data:")) {
    return { error: "reference_image_url 必须是 data:image/(png|jpeg|webp);base64,... 格式" };
  }
  const comma = s.indexOf(",");
  if (comma < 0) {
    return { error: "reference_image_url 必须是 data:image/(png|jpeg|webp);base64,... 格式" };
  }
  const header = s.slice(0, comma);
  const m = header.match(HEADER_RE);
  if (!m) {
    return { error: "reference_image_url 必须是 data:image/(png|jpeg|webp);base64,... 格式" };
  }
  const sub = m[1];
  const mime = `image/${sub === "jpg" ? "jpeg" : sub}`;
  const ext = sub === "jpeg" ? "jpg" : sub;
  const buffer = Buffer.from(s.slice(comma + 1), "base64");
  if (buffer.length === 0) return { error: "参考图为空" };
  if (buffer.length > MAX_SIZE) {
    return { error: `参考图太大(${(buffer.length / 1024 / 1024).toFixed(1)} MB),需 ≤ 20 MB` };
  }
  return { ext, size: buffer.length, mime, buffer };
}
