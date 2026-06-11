// Profile fixtures —— 后端尚未提供的字段，UI 用占位渲染
// 来源：原型设计V2/_extract/src/data.jsx · DATA.profile
// TODO(后端缺口)：
//   - lifetime 维度（累计图片/视频/积分）—— 后端目前只有 total_succeeded_count
//   - images.costPts / videos.costPts —— 后端无按 type 分桶的积分消耗
//   - purposes 的 pts/share —— 后端只有 count
//   - models 的 pts —— 后端只有 count

export interface ProfileFixture {
  lifetime: { images: number; videos: number; totalCost: number };
  /** 当个人图片产出无法从后端拿到积分消耗时，估算用：积分/张 */
  imgPtsPerCount: number;
  vidPtsPerCount: number;
}

export const PROFILE_FIXTURE: ProfileFixture = {
  lifetime: { images: 1842, videos: 38, totalCost: 28400 },
  imgPtsPerCount: 12,
  vidPtsPerCount: 80
};
