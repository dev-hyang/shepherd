import { dayKey } from "./util.js";

/* ============ 应用状态 ============
   在线优先：账号、家庭、成员和所有记录都来自 Supabase，不在本机保存副本。
   本机只记几样偏好：主题、界面语言。
   这个应用记的是"我自己"：每条数据都挂在 user_id 上，默认只有自己看得到；
   习惯可以逐项开给家庭（配偶）看完成情况，祷告清单永远只有自己看得到。 */
const S = {
  tab: "today",
  cloud: "loading",        // loading | offline | signedout | anon | ready（ready 时 family 可能为 null：还没加入家庭，照样能用）
  user: null, family: null, members: {},
  day: dayKey(Date.now()),   // 真正的今天
  pick: null,              // 今天页“补记”选的过去某一天（null = 今天）；见 wb.viewDay()
  review: { range: "4w", metric: "scripture" },
  prayerFilter: { status: "open", cat: "all", q: "" },
  prayerView: "pray",      // 祷告页的两个子页：pray 代祷 | notes 灵修笔记
  fpop: null,              // 当前展开的筛选面板（见 ui.js）
  showText: false          // 今天页是否展开经文正文
};

export { S };
