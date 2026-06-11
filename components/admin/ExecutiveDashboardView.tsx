"use client";

import {
  BarChart,
  KPI,
  TrendChart,
  fmtInt,
  type KpiData
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import type {
  DepartmentValueRow,
  ExecutiveDashboardData,
  DashboardChangeRow,
  ManagementAction,
  ModelProcurementRow,
  ScenarioValueRow
} from "@/lib/fixtures/executive-dashboard";

type Props = {
  data: ExecutiveDashboardData;
};

const CATEGORY_META: Record<
  DepartmentValueRow["category"],
  { label: string; color: string; bg: string }
> = {
  high_value: {
    label: "高投入高产出",
    color: "var(--success)",
    bg: "var(--success-soft)"
  },
  cost_risk: {
    label: "高投入低产出",
    color: "var(--danger)",
    bg: "rgba(239, 68, 68, 0.09)"
  },
  potential: {
    label: "低投入高潜力",
    color: "var(--accent)",
    bg: "var(--accent-soft)"
  },
  inactive: {
    label: "低活跃需推动",
    color: "var(--warn)",
    bg: "var(--warn-soft)"
  }
};

const ACTION_META: Record<
  ModelProcurementRow["action"],
  { color: string; bg: string }
> = {
  "续用": { color: "var(--success)", bg: "var(--success-soft)" },
  "观察": { color: "var(--accent)", bg: "var(--accent-soft)" },
  "限制": { color: "var(--warn)", bg: "var(--warn-soft)" },
  "下架评估": { color: "var(--danger)", bg: "rgba(239, 68, 68, 0.09)" }
};

const LEVEL_META: Record<ManagementAction["level"], { label: string; color: string; bg: string }> = {
  high: { label: "高优先级", color: "var(--danger)", bg: "rgba(239, 68, 68, 0.09)" },
  medium: { label: "中优先级", color: "var(--warn)", bg: "var(--warn-soft)" },
  low: { label: "观察", color: "var(--text-2)", bg: "var(--bg-muted)" }
};

const CHANGE_META: Record<DashboardChangeRow["type"], { color: string; bg: string }> = {
  "新增": { color: "var(--success)", bg: "var(--success-soft)" },
  "修改": { color: "var(--accent)", bg: "var(--accent-soft)" },
  "保留": { color: "var(--text-2)", bg: "var(--bg-muted)" },
  "未做": { color: "var(--warn)", bg: "var(--warn-soft)" }
};

export function ExecutiveDashboardView({ data }: Props) {
  const rateBars = data.roiTrend.map((p) => ({ d: p.d, v: p.rate }));

  return (
    <div className="page" data-screen-label="Executive Dashboard">
      <div className="crumb">
        <span>管理</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>老板驾驶舱</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title flex items-center gap-2">
            老板驾驶舱
            <DemoPill label="演示数据" />
          </div>
          <div className="page-subtitle">
            经营视角 · AI 投入产出与风险总览
          </div>
        </div>
      </div>

      <DataNotice notes={data.dataNotes} />

      <div className="kpi-row executive-kpi-row">
        {data.kpis.map((k: KpiData) => (
          <KPI key={k.key} k={k} />
        ))}
      </div>

      <section className="section">
        <SectionHead
          icon="trend"
          title="ROI 趋势"
          subtitle="成本、有效产出与有效产出率的月度变化"
          badge="有效产出口径待接真实埋点"
        />
        <div className="executive-roi-grid">
          <div className="card card-pad">
            <TrendChart
              data={data.roiTrend}
              series={[
                { key: "cost_k", label: "成本(千元)", color: "var(--warn)" },
                { key: "outputs", label: "有效产出", color: "var(--accent)" }
              ]}
              height={250}
            />
          </div>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 10 }}>
              <Icon name="star" size={13} style={{ color: "var(--success)" }} />
              有效产出率
            </div>
            <BarChart data={rateBars} height={210} color="var(--success)" />
            <div className="t-sub mt-2" style={{ color: "var(--text-3)" }}>
              当前按演示口径展示：收藏 / 下载 / 二次生成 / 人工采纳。
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead
          icon="building"
          title="部门价值矩阵"
          subtitle="用经营视角区分标杆、风险、潜力与待推动团队"
          badge="部门产出口径待接真实数据"
        />
        <div className="card overflow-hidden">
          <ResponsiveTable
            headers={["部门", "分类", "成本", "有效产出", "活跃率", "有效率", "经营信号"]}
          >
            {data.departmentMatrix.map((row) => {
              const meta = CATEGORY_META[row.category];
              return (
                <tr key={row.department}>
                  <td className="fw-6">{row.department}</td>
                  <td><Pill label={meta.label} color={meta.color} bg={meta.bg} /></td>
                  <td className="num">¥ {fmtInt(row.cost_cny)}</td>
                  <td className="num">{fmtInt(row.effective_outputs)} 件</td>
                  <td className="num">{row.active_rate}%</td>
                  <td className="num">{row.effective_rate}%</td>
                  <td style={{ color: "var(--text-2)" }}>{row.signal}</td>
                </tr>
              );
            })}
          </ResponsiveTable>
        </div>
      </section>

      <div className="executive-two-col">
        <section className="section" style={{ marginTop: 0 }}>
          <SectionHead
            icon="tag"
            title="业务场景价值"
            subtitle="看哪些场景值得继续产品化"
            badge="素材类型字段待接真实数据"
          />
          <div className="card overflow-hidden">
            <ResponsiveTable headers={["场景", "任务", "成本", "有效率", "建议动作"]}>
              {data.scenarioBreakdown.map((row: ScenarioValueRow) => (
                <tr key={row.scenario}>
                  <td className="fw-6">{row.scenario}</td>
                  <td className="num">{fmtInt(row.tasks)}</td>
                  <td className="num">¥ {fmtInt(row.cost_cny)}</td>
                  <td className="num">{row.effective_rate}%</td>
                  <td style={{ color: "var(--text-2)" }}>{row.action}</td>
                </tr>
              ))}
            </ResponsiveTable>
          </div>
        </section>

        <section className="section" style={{ marginTop: 0 }}>
          <SectionHead
            icon="chart"
            title="模型 / 工具采购视图"
            subtitle="从调用量升级到单位有效产出成本"
            badge="模型价格待接 EasyRouter 实价"
          />
          <div className="card overflow-hidden">
            <ResponsiveTable headers={["模型", "成本", "成功率", "耗时", "适用场景", "动作"]}>
              {data.modelPurchasing.map((row: ModelProcurementRow) => {
                const meta = ACTION_META[row.action];
                return (
                  <tr key={row.model}>
                    <td className="fw-6">{row.model}</td>
                    <td className="num">¥ {fmtInt(row.cost_cny)}</td>
                    <td className="num">{row.success_rate}%</td>
                    <td className="num">{row.avg_seconds}s</td>
                    <td style={{ color: "var(--text-2)" }}>{row.best_for}</td>
                    <td><Pill label={row.action} color={meta.color} bg={meta.bg} /></td>
                  </tr>
                );
              })}
            </ResponsiveTable>
          </div>
        </section>
      </div>

      <section className="section">
        <SectionHead
          icon="bell"
          title="风险与管理动作"
          subtitle="把数据提示转成老板可直接分派的事项"
          badge="建议动作待接处理状态"
        />
        <div className="executive-actions-grid">
          {data.managementActions.map((item) => {
            const meta = LEVEL_META[item.level];
            return (
              <article
                key={item.title}
                className="card card-pad"
                style={{
                  minHeight: 158,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                }}
              >
                <Pill label={meta.label} color={meta.color} bg={meta.bg} />
                <div className="fw-6" style={{ lineHeight: 1.35 }}>
                  {item.title}
                </div>
                <div className="t-sub" style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
                  {item.evidence}
                </div>
                <div style={{ flex: 1 }} />
                <div className="t-sub" style={{ color: "var(--text-3)" }}>
                  建议负责人：<span style={{ color: "var(--text-2)" }}>{item.owner}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <SectionHead
          icon="layers"
          title="本次增删改对比记录"
          subtitle="记录老板驾驶舱相对原有数据看板的新增、修改、保留与未做项"
          badge="变更说明"
        />
        <div className="card overflow-hidden">
          <ResponsiveTable headers={["类型", "部分", "原有部分", "当前修改后", "备注"]}>
            {data.changeLog.map((row) => {
              const meta = CHANGE_META[row.type];
              return (
                <tr key={`${row.type}-${row.area}`}>
                  <td><Pill label={row.type} color={meta.color} bg={meta.bg} /></td>
                  <td className="fw-6">{row.area}</td>
                  <td style={{ color: "var(--text-2)", whiteSpace: "normal", minWidth: 220 }}>{row.original}</td>
                  <td style={{ color: "var(--text-2)", whiteSpace: "normal", minWidth: 220 }}>{row.current}</td>
                  <td style={{ color: "var(--text-3)", whiteSpace: "normal", minWidth: 180 }}>{row.note}</td>
                </tr>
              );
            })}
          </ResponsiveTable>
        </div>
      </section>

      <style jsx>{`
        .executive-kpi-row {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .executive-roi-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.8fr);
          gap: 16px;
        }
        .executive-two-col {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 16px;
        }
        .executive-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        @media (max-width: 980px) {
          .executive-roi-grid,
          .executive-two-col {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .executive-kpi-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function DataNotice({ notes }: { notes: string[] }) {
  return (
    <div
      className="card card-pad"
      style={{
        borderColor: "rgba(124, 92, 255, 0.24)",
        background:
          "linear-gradient(135deg, rgba(124, 92, 255, 0.08), rgba(16, 185, 129, 0.06))"
      }}
    >
      <div className="section-title">
        <Icon name="info" size={14} style={{ color: "var(--accent)" }} />
        数据口径说明
      </div>
      <div className="executive-note-grid">
        {notes.map((note) => (
          <div key={note} className="t-sub" style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
            {note}
          </div>
        ))}
      </div>
      <style jsx>{`
        .executive-note-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  subtitle,
  badge
}: {
  icon: "trend" | "building" | "tag" | "chart" | "bell" | "layers";
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className="section-head">
      <div>
        <div className="section-title">
          <Icon name={icon} size={13} style={{ color: "var(--accent)" }} />
          {title}
        </div>
        <div className="t-sub" style={{ color: "var(--text-3)", marginTop: 3 }}>
          {subtitle}
        </div>
      </div>
      <DemoPill label={badge} muted />
    </div>
  );
}

function ResponsiveTable({
  headers,
  children
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--text-3)",
                  fontWeight: 500,
                  borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap"
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      <style jsx>{`
        tbody :global(td) {
          padding: 13px 14px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          vertical-align: middle;
          white-space: nowrap;
        }
        tbody :global(tr:last-child td) {
          border-bottom: 0;
        }
      `}</style>
    </div>
  );
}

function DemoPill({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className="chip"
      style={{
        background: muted ? "var(--bg-muted)" : "var(--accent-soft)",
        color: muted ? "var(--text-2)" : "var(--accent)",
        border: muted ? "1px solid var(--border)" : "1px solid rgba(124, 92, 255, 0.25)",
        fontSize: 11.5
      }}
    >
      {label}
    </span>
  );
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="chip"
      style={{
        color,
        background: bg,
        border: "1px solid color-mix(in srgb, currentColor 24%, transparent)",
        fontSize: 11.5,
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </span>
  );
}
