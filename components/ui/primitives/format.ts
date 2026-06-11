// 共享数字格式化（中文千分位用 en-US 风格逗号符合现有设计）
export const fmtInt = (v: number): string => Math.round(v).toLocaleString("en-US");
export const fmtCurrency = (v: number): string => "¥" + fmtInt(v);
export const fmtPct = (v: number, digits = 1): string => v.toFixed(digits) + "%";
export const fmtCompact = (v: number): string => {
  if (Math.abs(v) >= 10000) {
    return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return v.toLocaleString("en-US");
};
