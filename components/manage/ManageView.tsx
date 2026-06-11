"use client";

import { useState, type ReactNode } from "react";
import { Tabs, type TabItem } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import type { TodoBreakdown } from "@/lib/admin/todos";

// /manage 管理面板（V2 ViewManage 外壳，来源：原型设计V2/_extract/src/view-manage.jsx）
// 内部 3 tab（audit/quota/purposes）复用现有 ReimbursementReviewPanel / QuotaPanel / PurposeTagsPanel
// TODO（V2 完整迁移）：内部 3 个 panel 的视觉/交互细节（行展开、行内编辑、合并向导）尚未对齐 V2，
//                   仅保留功能；后续可按 view-manage.jsx 精修

type ManageTab = "audit" | "quota" | "purposes";

interface Props {
  defaultTab?: ManageTab;
  todoBreakdown: TodoBreakdown;
  panels: Record<ManageTab, ReactNode>;
}

export function ManageView({
  defaultTab = "audit",
  todoBreakdown,
  panels
}: Props) {
  const [tab, setTab] = useState<ManageTab>(defaultTab);
  const { pendingReimb, overQuota, mergeCandidates, total } = todoBreakdown;
  // tab 角标用「配额超额」(danger) 与 admin KPI 卡口径完全一致，
  // 不再用 ≥80% 的 warning 计数（避免跨入口数字打架）。
  const tabs: TabItem<ManageTab>[] = [
    { value: "audit", label: "报销审核", icon: "receipt", count: pendingReimb || undefined },
    { value: "quota", label: "配额管理", icon: "shield", count: overQuota || undefined },
    { value: "purposes", label: "使用目的", icon: "tag", count: mergeCandidates || undefined }
  ];

  // 与 admin KPI 卡 total 严格一致：报销 + 超额。合并建议是弱信号，
  // 显示但不阻止「干净利落」状态进入（避免 admin 永远看到不为 0）。
  const hasUrgent = total > 0;

  return (
    <div className="page" data-screen-label="Manage">
      <div className="crumb">
        <span>管理</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>管理面板</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">管理面板</div>
          <div className="page-subtitle">运营 · 审批 · 配额 · 标签治理</div>
        </div>
      </div>

      {hasUrgent ? (
        <div className="todo-bar">
          <div className="todo-bar-cell" style={{ paddingRight: 14 }}>
            <Icon name="alert" size={16} style={{ color: "var(--warn)" }} />
            <span
              className="fw-6"
              style={{ color: "var(--warn)", fontSize: 13, whiteSpace: "nowrap" }}
            >
              本日待处理
            </span>
          </div>
          <TodoCell
            num={pendingReimb}
            label="报销待审"
            hint={pendingReimb > 0 ? "尽快处理 · 影响 SLA" : "全部已审"}
            onClick={() => setTab("audit")}
          />
          <TodoCell
            num={overQuota}
            label="配额超额"
            hint={overQuota > 0 ? "已超出本月上限" : "无超额部门"}
            color="var(--danger)"
            onClick={() => setTab("quota")}
          />
          <TodoCell
            num={mergeCandidates}
            label="标签合并建议"
            hint={mergeCandidates > 0 ? "弱信号 · 治理建议" : "暂无建议"}
            color="var(--text-2)"
            onClick={() => setTab("purposes")}
          />
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-soft btn-sm"
            onClick={() => setTab(pendingReimb > 0 ? "audit" : "quota")}
            style={{ whiteSpace: "nowrap" }}
          >
            <Icon name="check" size={12} /> 优先处理
          </button>
        </div>
      ) : (
        <div className="todo-bar clear">
          <Icon name="check" size={16} style={{ color: "var(--success)" }} />
          <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 500 }}>
            暂无紧急待办 · 干净利落
            {mergeCandidates > 0 && (
              <span
                style={{ color: "var(--text-3)", marginLeft: 8, fontWeight: 400 }}
              >
                · 另有 {mergeCandidates} 项标签合并建议
              </span>
            )}
          </span>
        </div>
      )}

      <Tabs value={tab} onChange={setTab} items={tabs} />

      <div className="mt-4 fade-in" key={tab}>
        {panels[tab]}
      </div>
    </div>
  );
}

function TodoCell({
  num,
  label,
  hint,
  color = "var(--warn)",
  onClick
}: {
  num: number;
  label: string;
  hint: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <div
      className="todo-bar-cell"
      style={{ cursor: "pointer", alignItems: "center", whiteSpace: "nowrap" }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="todo-bar-num num" style={{ color, fontSize: 22 }}>
        {num}
      </span>
      <div className="todo-bar-label" style={{ whiteSpace: "nowrap" }}>
        <strong style={{ fontSize: 12.5 }}>{label}</strong>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{hint}</span>
      </div>
    </div>
  );
}
