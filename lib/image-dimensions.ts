// 从图片字节读真实像素尺寸 —— 无第三方依赖,纯解析文件头
// 支持 PNG / JPEG / GIF / WebP;无法识别时返回 null
//
// 用途:生成图片落库时存"实际"尺寸,而非"请求比例"的名义尺寸
// (2026-05-21:修复 generation_results.width/height 存假数据的 bug)

export type Dimensions = { width: number; height: number };

export function imageDimensions(buf: Buffer): Dimensions | null {
  if (buf.length < 24) return null;

  // ── PNG:89 50 4E 47;IHDR 里 width@16 / height@20(大端 32 位)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // ── GIF:"GIF8";width@6 / height@8(小端 16 位)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // ── JPEG:FF D8;扫描 SOF 段,height@+5 / width@+7(大端 16 位)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      // 无 payload 的 marker(SOI/EOI/RSTn/TEM)只占 2 字节;其余跳过 2 + 段长
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
      } else {
        off += 2 + buf.readUInt16BE(off + 2);
      }
    }
    return null;
  }

  // ── WebP:"RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const fourcc = buf.toString("ascii", 12, 16);
    if (fourcc === "VP8X") {
      // 扩展格式:24 位小端 (width-1)@24 / (height-1)@27
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width: w, height: h };
    }
    if (fourcc === "VP8 ") {
      // 有损简单格式:14 位 width@26 / height@28
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === "VP8L") {
      // 无损格式:@21 起位打包 14 位 (width-1) / 14 位 (height-1)
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width: w, height: h };
    }
    return null;
  }

  return null;
}
