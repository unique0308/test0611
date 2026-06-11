import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readLocalFile, statLocalFile, isLocalMode } from "@/lib/storage";

// GET /api/files/<path>
// STORAGE_MODE=local 时的本地文件服务
// 鉴权:用户只能访问自己 generations 目录下的文件(防越权)
// admin 可访问任意路径(用于看板调试,Week 2 后用得到)
//
// path 规范:
//   /generations/{user_id}/{task_id}/result.<ext>
//   /references/{user_id}/{ts}.<ext>
//   /avatars/{user_id}/{ts}.<ext>

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!isLocalMode()) {
    // STORAGE_MODE=oss 时不应该走这个路由(OSS 签名 URL 直链);防御性返回 404
    return new NextResponse("not in local storage mode", { status: 404 });
  }

  const user = await requireAuth();
  const relativePath = "/" + params.path.join("/");

  // 鉴权:非 admin 只能访问自己 user_id 下的文件
  if (!user.is_admin) {
    const m = relativePath.match(/^\/(generations|references|avatars)\/([^/]+)\//);
    if (!m || m[2] !== user.id) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const stat = await statLocalFile(relativePath);
  if (!stat) return new NextResponse("not found", { status: 404 });

  const buf = await readLocalFile(relativePath);
  const contentType = guessContentType(relativePath);

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300"
    }
  });
}

function guessContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}
