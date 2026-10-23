/* ============ 任务分类：大类 → 小类 ============
   内置一套默认的（名字、图标、颜色）；以后在“任务 → 分类”里可以改名、加、删，存在 wb_profile.settings.taskCats。
   习惯按种类映射到大类，任务和习惯在报表里才能放进同一套分类。文字都是简体键，显示时经过 t()（自己改的名字不翻译）。 */
const DEFAULT_CATS = [
  { id: "inbox",  name: "收件箱", icon: "📥", color: "#8A948F", subs: [] },
  { id: "spirit", name: "属灵",   icon: "🕊", color: "#7A6FB5", subs: [{ id: "devotion", name: "读经祷告" }, { id: "serve", name: "服事" }, { id: "meeting", name: "聚会" }, { id: "disciple", name: "门徒" }] },
  { id: "family", name: "家庭",   icon: "🏡", color: "#C8743A", subs: [{ id: "spouse", name: "配偶" }, { id: "kids", name: "孩子" }, { id: "parents", name: "父母" }, { id: "visit", name: "亲友探访" }] },
  { id: "body",   name: "身体",   icon: "🏃", color: "#5B8E5A", subs: [{ id: "exercise", name: "锻炼" }, { id: "diet", name: "饮食" }, { id: "checkup", name: "就医体检" }, { id: "sleep", name: "睡眠" }] },
  { id: "work",   name: "工作",   icon: "💼", color: "#5F7F9B", subs: [{ id: "project", name: "项目" }, { id: "meeting", name: "会议" }, { id: "learn", name: "学习进修" }] },
  { id: "home",   name: "家务",   icon: "🧹", color: "#B07A1A", subs: [{ id: "shop", name: "采购" }, { id: "repair", name: "维修" }, { id: "money", name: "财务账单" }, { id: "tidy", name: "整理" }] },
  { id: "self",   name: "个人",   icon: "🌿", color: "#3F8664", subs: [{ id: "read", name: "阅读" }, { id: "hobby", name: "兴趣" }, { id: "rest", name: "休息" }] }
];
// 习惯种类 → 大类
const KIND_CAT = { scripture: "spirit", prayer: "spirit", exercise: "body", diet: "body", sleep: "body", med: "body", supplement: "body", screen: "self", focus: "self", custom: "self" };
export { DEFAULT_CATS, KIND_CAT };
