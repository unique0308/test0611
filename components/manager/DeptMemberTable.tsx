import type { DeptMemberRow } from "@/lib/db/queries";

// V1.5 本部门员工排行表(替代 admin 的 DeptRankTable)
// 显示本部门所有员工本月调用次数 + 积分消耗,按 credits_used 降序

export function DeptMemberTable({ rows, deptName }: { rows: DeptMemberRow[]; deptName: string }) {
  const topCredits = rows[0]?.credits_used ?? 0;
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg/40">
        <h3 className="text-cap text-text-2 uppercase tracking-wider">{deptName} · 员工活跃排行</h3>
      </div>
      <table className="w-full text-body">
        <thead className="bg-bg text-sub text-text-2">
          <tr>
            <th className="text-left px-4 py-3 font-medium w-[50px]">#</th>
            <th className="text-left px-4 py-3 font-medium">员工</th>
            <th className="text-right px-4 py-3 font-medium w-[110px]">调用次数</th>
            <th className="text-right px-4 py-3 font-medium w-[120px]">消耗积分</th>
            <th className="text-left px-4 py-3 font-medium w-[200px]">相对峰值</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-text-3 py-8">本部门暂无员工或暂无生成数据</td>
            </tr>
          ) : (
            rows.map((r, idx) => {
              const ratio = topCredits > 0 ? r.credits_used / topCredits : 0;
              return (
                <tr key={r.user_id} className="border-t border-border hover:bg-bg/30">
                  <td className="px-4 py-3 text-text-3 num">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-primary-soft text-primary text-small font-semibold shrink-0">
                        {r.user_name.slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-body truncate">{r.user_name}</div>
                        <div className="text-cap text-text-3 truncate">{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right num">{r.call_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right num">{r.credits_used.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
