import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createRequest,
  listRequests,
  notifyReimbursementSubmitted,
  AmountExceedsLimitError,
  SINGLE_LIMIT_CNY,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE
} from "@/lib/reimbursements";
import { uploadFile } from "@/lib/storage";
import { writeAuditLog } from "@/lib/db/queries";

// V1.2 工具报销 - 提交申请
// 接收 multipart/form-data:文本字段 + 多个凭证文件
// 决策依据:技术跟踪 §7 Week 4 任务 4.5;Q-V1-03 单笔上限 ¥2000

const ALLOWED_PAYMENT_TYPES = new Set(["monthly", "annual", "api_topup", "one_time", "plugin"]);
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf"
]);

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user.department_id) {
    return NextResponse.json(
      { error: "missing_department", message: "未分配部门,无法提交报销" },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new NextResponse("invalid multipart", { status: 400 });
  }

  // 解析文本字段
  const tool_name = String(form.get("tool_name") ?? "").trim();
  const amount_str = String(form.get("amount_cny") ?? "");
  const usage_period_start = String(form.get("usage_period_start") ?? "");
  const usage_period_end = String(form.get("usage_period_end") ?? "");
  const purpose_description = String(form.get("purpose_description") ?? "").trim();
  const payment_type = String(form.get("payment_type") ?? "");

  // 应用层校验(双重保险,DB CHECK 也会拒)
  if (!tool_name) return NextResponse.json({ error: "tool_name required" }, { status: 422 });
  if (!ALLOWED_PAYMENT_TYPES.has(payment_type)) {
    return NextResponse.json({ error: "invalid payment_type" }, { status: 422 });
  }
  if (!purpose_description) {
    return NextResponse.json({ error: "purpose_description required" }, { status: 422 });
  }
  const amount_cny = parseFloat(amount_str);
  if (!Number.isFinite(amount_cny) || amount_cny <= 0) {
    return NextResponse.json({ error: "amount_cny must be > 0" }, { status: 422 });
  }
  if (amount_cny > SINGLE_LIMIT_CNY) {
    return NextResponse.json(
      { error: "amount_exceeds_limit", message: `单笔上限 ¥${SINGLE_LIMIT_CNY}` },
      { status: 422 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usage_period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(usage_period_end)) {
    return NextResponse.json({ error: "invalid date format, expect YYYY-MM-DD" }, { status: 422 });
  }
  if (usage_period_end < usage_period_start) {
    return NextResponse.json({ error: "usage_period_end must be >= start" }, { status: 422 });
  }

  // 解析凭证文件(允许多个,限 5 个 ≤ 10MB / 个,允许图片 + PDF)
  const files = form.getAll("attachments").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "at least 1 attachment required" }, { status: 422 });
  }
  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `max ${MAX_ATTACHMENTS} attachments` },
      { status: 422 }
    );
  }
  for (const f of files) {
    if (f.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: `file ${f.name} exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB` },
        { status: 422 }
      );
    }
    if (!ALLOWED_MIMES.has(f.type)) {
      return NextResponse.json(
        { error: `file ${f.name} has unsupported type: ${f.type}` },
        { status: 422 }
      );
    }
  }

  // 写盘 → lib/storage 抽象层(mock 落 ./uploads/reimbursements/...,切真实 OSS 只换 STORAGE_MODE)
  const attachment_paths: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safeName = sanitizeFilename(f.name) || `file-${i}`;
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
    const path = `/reimbursements/${user.id}/${ts}-${i}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await uploadFile(buf, path);
    attachment_paths.push(path);
  }

  // 插库(DB trigger 自动填 request_number = R-{4 位})
  let row;
  try {
    row = await createRequest({
      user_id: user.id,
      department_id: user.department_id,
      attachment_paths,
      input: {
        tool_name,
        amount_cny,
        usage_period_start,
        usage_period_end,
        purpose_description,
        payment_type: payment_type as
          | "monthly"
          | "annual"
          | "api_topup"
          | "one_time"
          | "plugin"
      }
    });
  } catch (e: unknown) {
    if (e instanceof AmountExceedsLimitError) {
      return NextResponse.json(
        { error: "amount_exceeds_limit", message: `单笔上限 ¥${SINGLE_LIMIT_CNY}` },
        { status: 422 }
      );
    }
    throw e;
  }

  // audit + notify admin
  await writeAuditLog({
    user_id: user.id,
    action: "reimbursement_submit",
    target_type: "reimbursement_request",
    target_id: String(row.id),
    metadata: {
      request_number: row.request_number,
      tool_name: row.tool_name,
      amount_cny: row.amount_cny
    }
  });
  await notifyReimbursementSubmitted({
    request: row,
    user_name: user.name,
    department_name: user.department_name
  });

  return NextResponse.json(row);
}

// GET /api/reimbursements?status=pending&page=&page_size=
// 员工:只列自己;admin:列全部(由 user.is_admin 决定 scope)
export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const sp = req.nextUrl.searchParams;

  const statusRaw = sp.get("status");
  const page = sp.get("page");
  const pageSize = sp.get("page_size");

  const result = await listRequests({
    user_id: user.id,
    is_admin: user.is_admin,
    status:
      statusRaw === "pending" || statusRaw === "approved" || statusRaw === "rejected"
        ? statusRaw
        : undefined,
    page: page ? Number(page) : 1,
    page_size: pageSize ? Number(pageSize) : 20
  });

  return NextResponse.json(result);
}

function sanitizeFilename(name: string): string {
  // 去掉路径分隔符 + 控制字符,限 80 字符
  return name.replace(/[\\/\x00-\x1f]+/g, "_").slice(0, 80);
}
