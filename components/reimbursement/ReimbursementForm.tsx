"use client";

import { useRef, useState } from "react";
import { ParamSelect } from "@/components/generate/ParamSelect";
import type { ReimbursementToolPreset, ReimbursementPaymentType } from "@/lib/reimbursements";
import { PAYMENT_TYPES, brandColor } from "./shared";

// 工具报销 - 申请表单(2026-05-21 重塑:从 ReimbursementPanel 拆出,费用类型改 ParamSelect)
// 决策 14 D2 / D6:3 状态 / 无草稿;单笔上限 ¥2000(Q-V1-03)

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SINGLE_LIMIT = 2000;

type Props = {
  toolPresets: ReimbursementToolPreset[];
  onSubmitted: () => void; // 提交成功 → 由 View 切到「报销记录」并刷新
};

export function ReimbursementForm({ toolPresets, onSubmitted }: Props) {
  const [toolName, setToolName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<ReimbursementPaymentType>("monthly");
  const [periodStart, setPeriodStart] = useState(todayMonthStart());
  const [periodEnd, setPeriodEnd] = useState(todayMonthEnd());
  const [purpose, setPurpose] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setSubmitError("金额必须为正数");
    if (amt > SINGLE_LIMIT) return setSubmitError(`单笔上限 ¥${SINGLE_LIMIT}`);
    if (!toolName.trim()) return setSubmitError("请填写工具名称");
    if (!purpose.trim()) return setSubmitError("请填写使用说明");
    if (files.length === 0) return setSubmitError("请上传至少一个凭证");
    if (periodEnd < periodStart) return setSubmitError("结束日期不能早于开始日期");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("tool_name", toolName.trim());
      fd.set("amount_cny", String(amt));
      fd.set("usage_period_start", periodStart);
      fd.set("usage_period_end", periodEnd);
      fd.set("purpose_description", purpose.trim());
      fd.set("payment_type", paymentType);
      for (const f of files) fd.append("attachments", f);

      const res = await fetch("/api/reimbursements", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `提交失败 (${res.status})`);
      }

      // 重置表单
      setToolName("");
      setAmount("");
      setPurpose("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSubmitted();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFiles(picked: FileList | File[]) {
    const merged = [...files, ...Array.from(picked)].slice(0, MAX_FILES);
    setFiles(merged.filter(f => f.size <= MAX_FILE_SIZE));
  }

  const overLimit = parseFloat(amount) > SINGLE_LIMIT;

  return (
    <form className="p-6" onSubmit={handleSubmit}>
      <div className="mb-4">
        <h4 className="text-body font-semibold text-text">填写工具报销申请</h4>
        <p className="text-cap text-text-3 mt-0.5">
          提交垂直工具(如 Cursor、Tripo 等)的使用费用 · 单笔上限 ¥ 2,000
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {/* 工具名称 */}
        <FormRow label="工具名称" required>
          <FieldShell>
            <SearchIcon />
            <input
              type="text"
              value={toolName}
              onChange={e => setToolName(e.target.value)}
              placeholder="如:Cursor、Tripo、Runway、ElevenLabs…"
              className="flex-1 bg-transparent outline-none text-body placeholder:text-placeholder"
            />
          </FieldShell>
          <div className="flex flex-wrap gap-2 mt-2">
            {toolPresets.map(p => (
              <button
                type="button"
                key={p.id}
                onClick={() => setToolName(p.name)}
                className={
                  "inline-flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-md text-cap transition " +
                  (toolName === p.name
                    ? "bg-primary-soft text-primary border border-primary"
                    : "bg-bg border border-border text-text-2 hover:border-border-strong")
                }
              >
                <span
                  className="w-5 h-5 rounded-sm inline-flex items-center justify-center text-white text-cap font-semibold"
                  style={{ background: brandColor(p.name) }}
                >
                  {p.name.slice(0, 1)}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </FormRow>

        {/* 报销金额 */}
        <FormRow label="报销金额" required>
          <FieldShell>
            <span className="text-text-3 font-medium">¥</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent outline-none text-body num placeholder:text-placeholder"
            />
            <span className="text-cap text-text-3">CNY</span>
          </FieldShell>
          {overLimit && <p className="text-cap text-danger mt-1">超过单笔上限 ¥{SINGLE_LIMIT}</p>}
        </FormRow>

        {/* 费用类型 — ParamSelect 弹层 */}
        <FormRow label="费用类型" required>
          <ParamSelect<ReimbursementPaymentType>
            label=""
            value={paymentType}
            onChange={setPaymentType}
            options={PAYMENT_TYPES}
            fullWidth
          />
        </FormRow>

        {/* 使用周期 */}
        <FormRow label="使用周期" required>
          <FieldShell>
            <CalendarIcon />
            <input
              type="date"
              value={periodStart}
              onChange={e => setPeriodStart(e.target.value)}
              className="bg-transparent outline-none text-body num"
              style={{ maxWidth: 130 }}
            />
            <span className="text-text-3">→</span>
            <input
              type="date"
              value={periodEnd}
              onChange={e => setPeriodEnd(e.target.value)}
              className="bg-transparent outline-none text-body num"
              style={{ maxWidth: 130 }}
            />
          </FieldShell>
        </FormRow>

        {/* 使用说明 */}
        <FormRow label="使用说明" required full>
          <textarea
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            placeholder="说明该工具用于哪类业务场景及预期产出,例如:用于 3D 模型快速制作,本月预计完成 8 个角色 LOD0;与现有管线对接,可减少外包约 60%。"
            rows={3}
            className="w-full bg-bg border border-border rounded-md p-3 text-body outline-none focus:border-primary placeholder:text-placeholder resize-y"
          />
        </FormRow>

        {/* 上传凭证 */}
        <FormRow label="上传凭证" required full>
          <UploadDropzone
            files={files}
            onPick={handleFiles}
            onRemove={i => setFiles(files.filter((_, idx) => idx !== i))}
            fileInputRef={fileInputRef}
          />
        </FormRow>

        {/* footer */}
        <div className="col-span-2 flex items-center justify-between gap-3 pt-4 mt-1 border-t border-border">
          <p className="text-cap text-text-3 inline-flex items-center gap-1.5">
            <InfoIcon />
            提交后由管理员审核,通常 1–3 个工作日完成
          </p>
          <div className="flex items-center gap-3">
            {submitError && <span className="text-cap text-danger">{submitError}</span>}
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-5 rounded-md bg-primary text-white text-body font-medium hover:bg-primary-ink disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
              {submitting ? "提交中…" : "提交报销申请"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function FormRow({
  label,
  required,
  full,
  children
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-sub text-text-2 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function FieldShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 h-10 px-3 bg-bg border border-border rounded-md focus-within:border-primary transition">
      {children}
    </div>
  );
}

function UploadDropzone({
  files,
  onPick,
  onRemove,
  fileInputRef
}: {
  files: File[];
  onPick: (files: FileList | File[]) => void;
  onRemove: (idx: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onPick(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={
          "rounded-md border-2 border-dashed px-5 py-6 text-center cursor-pointer transition " +
          (dragging ? "border-primary bg-primary-soft" : "border-border bg-bg/40 hover:border-border-strong")
        }
      >
        <div className="text-text-3 mb-2 flex justify-center">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
        </div>
        <div className="text-body">
          将发票 / 收据 / 订阅截图拖至此处,或 <span className="text-primary">点击上传</span>
        </div>
        <div className="text-cap text-text-3 mt-1">支持 PDF / PNG / JPG / WebP,单文件 ≤ 10 MB,最多 5 个</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          onChange={e => e.target.files && onPick(e.target.files)}
          className="hidden"
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2 bg-bg border border-border rounded-md">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-text-3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span className="flex-1 truncate text-small text-text">{f.name}</span>
              <span className="text-cap text-text-3 num">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="text-text-3 hover:text-danger"
                title="移除"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function todayMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayMonthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}
