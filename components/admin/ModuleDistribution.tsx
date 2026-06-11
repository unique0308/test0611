// Module distribution panel
// 2026-05-26 简化：类型分布从 donut 改成顶部单行堆叠条（只有图/视频两值，donut 浪费空间）
//   layout: 顶部一行类型条 banner（横跨）+ 下方两列：模型 Top / 使用目的
// 设计参考 4.3 Panel 2

type Item = { label: string; count: number };
type Props = {
  typeDist: Array<{ type: string; count: number }>;
  modelTop: Array<{ model_name: string; count: number }>;
  purposeDist: Array<{ purpose_tag_name: string; count: number }>;
};

const IMG_COLOR = "#2B6CFE";
const VID_COLOR = "#7A4BFF";

export function ModuleDistribution({ typeDist, modelTop, purposeDist }: Props) {
  const totalType = typeDist.reduce((s, r) => s + r.count, 0);
  const imgRow = typeDist.find((d) => d.type === "image");
  const vidRow = typeDist.find((d) => d.type === "video");
  const imgCount = imgRow?.count ?? 0;
  const vidCount = vidRow?.count ?? 0;
  const imgPct = totalType > 0 ? (imgCount / totalType) * 100 : 0;
  const vidPct = totalType > 0 ? (vidCount / totalType) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-cap text-text-2 uppercase tracking-wider">类型分布</h3>
          <span className="text-small text-text-3">
            共 <span className="num text-text-2 font-semibold">{totalType}</span> 次调用
          </span>
        </div>
        {totalType === 0 ? (
          <div className="text-text-3 text-small text-center py-4">暂无数据</div>
        ) : (
          <>
            <div className="h-2 bg-border rounded-full overflow-hidden flex">
              <div style={{ width: `${imgPct}%`, background: IMG_COLOR }} />
              <div style={{ width: `${vidPct}%`, background: VID_COLOR }} />
            </div>
            <div className="flex items-center gap-6 mt-3 text-small">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: IMG_COLOR }} />
                <span className="text-text-2">图片</span>
                <span className="num text-text font-semibold">{imgCount}</span>
                <span className="text-text-3 num">· {imgPct.toFixed(1)}%</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: VID_COLOR }} />
                <span className="text-text-2">视频</span>
                <span className="num text-text font-semibold">{vidCount}</span>
                <span className="text-text-3 num">· {vidPct.toFixed(1)}%</span>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-cap text-text-2 uppercase tracking-wider mb-3">模型 Top 8</h3>
          <BarList
            items={modelTop.map((m) => ({ label: m.model_name, count: m.count }))}
            color={IMG_COLOR}
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-cap text-text-2 uppercase tracking-wider mb-3">使用目的分布</h3>
          <BarList
            items={purposeDist.map((p) => ({ label: p.purpose_tag_name, count: p.count }))}
            color={VID_COLOR}
          />
        </div>
      </div>
    </div>
  );
}

function BarList({ items, color }: { items: Item[]; color: string }) {
  if (items.length === 0) {
    return <div className="text-text-3 text-small text-center py-8">暂无数据</div>;
  }
  const max = Math.max(...items.map(i => i.count));
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = max > 0 ? (item.count / max) * 100 : 0;
        return (
          <div key={i}>
            <div className="flex justify-between text-small mb-1">
              <span className="text-text truncate flex-1 mr-2" title={item.label}>{item.label}</span>
              <span className="num text-text-2">{item.count}</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct.toFixed(1)}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
