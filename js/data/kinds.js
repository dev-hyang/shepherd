/* ============ 习惯的种类 ============
   mode 决定今天页上怎么打卡、回顾页上怎么统计：
   check   做了 / 没做（读经、自定义）
   count   一天可以记好几次（祷告）
   minutes 记分钟数，和目标比（锻炼、带分钟目标的自定义）
   rating  三档评价（饮食：好 / 一般 / 失控）
   value   一天一个数（屏幕分钟，越少越好；睡眠小时，越接近目标越好）
   slots   按时间点逐个"服了 / 跳过"（用药、保健品）
   文字都是简体键，显示时经过 t()。颜色在浅色、深色底上都能读。 */
const KINDS = {
  scripture:  { label: "读经",     icon: "📖", color: "#4C7A3F", mode: "check" },
  prayer:     { label: "祷告",     icon: "🕊", color: "#7A6FB5", mode: "count" },
  exercise:   { label: "锻炼",     icon: "🏃", color: "#C8743A", mode: "minutes" },
  diet:       { label: "健康饮食", icon: "🥗", color: "#5B8E5A", mode: "rating" },
  screen:     { label: "屏幕时长", icon: "📱", color: "#5F7F9B", mode: "value", unit: "分钟", lowerBetter: true },
  sleep:      { label: "睡眠",     icon: "🌙", color: "#4F8FA8", mode: "value", unit: "小时" },
  med:        { label: "用药",     icon: "💊", color: "#B44B60", mode: "slots" },
  supplement: { label: "保健品",   icon: "🌿", color: "#3F8664", mode: "slots" },
  focus:      { label: "专注",     icon: "🍅", color: "#C25450", mode: "minutes" },   // 由专注计时器自动记录，一段一条
  custom:     { label: "自定义",   icon: "✦",  color: "#8A6FB0", mode: "check" }
};
const kindOf = p => KINDS[p && p.kind] || KINDS.custom;
// 自定义习惯填了分钟目标就按分钟记
const modeOf = p => (p.kind === "custom" && p.target && p.target.minutes) ? "minutes" : kindOf(p).mode;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const EXERCISE_TYPES = ["走路", "跑步", "力量", "骑车", "游泳", "拉伸", "球类", "其他"];
const RATINGS = { 3: "好", 2: "一般", 1: "失控" };
const PRAYER_CATS = { family: "家人", church: "教会", friends: "朋友", self: "自己", world: "世界" };

/* 起步模板：一键建立最常见的几项。名字留空，界面按种类显示（跟随界面语言），用户随时改名。
   时间点进日历订阅；屏幕和饮食晚上填，所以提醒放在晚上。 */
const TEMPLATE = [
  { kind: "scripture",  name: "", schedule: { days: ALL_DAYS, times: ["07:00"], remind: true },  target: { per: "day" } },
  { kind: "prayer",     name: "", schedule: { days: ALL_DAYS, times: ["07:15", "21:30"], remind: true }, target: { per: "day", count: 1 } },
  { kind: "exercise",   name: "", schedule: { days: [1, 3, 5], times: ["18:00"], remind: true }, target: { per: "week", count: 3, minutes: 30 } },
  { kind: "screen",     name: "", schedule: { days: ALL_DAYS, times: ["21:00"], remind: true },  target: { per: "day", max: 120 } },
  { kind: "diet",       name: "", schedule: { days: ALL_DAYS, times: ["20:30"], remind: false }, target: { per: "day" } },
  { kind: "focus",      name: "", schedule: { days: [1, 2, 3, 4, 5], times: [], remind: false }, target: { per: "day", count: 4 } }
];

export { KINDS, kindOf, modeOf, ALL_DAYS, WEEKDAY, EXERCISE_TYPES, RATINGS, PRAYER_CATS, TEMPLATE };
