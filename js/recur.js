import { dayKey, pad } from "./core/util.js";

/* ============ 任务的日期计算：周期、重复、一句话解析 ============
   全是纯函数（不碰 DOM、不碰数据库），日期都用 "YYYY-MM-DD" 字符串，从中午算，夏令时那天也不会差一天。
   重复任务是一条主记录：完成时把 due 推到下一次（nextDue）；计划视图里用 expand 把未来几次展开显示。 */
const D = 86400e3;
const toTs = day => new Date(day + "T12:00:00").getTime();
const addDays = (day, n) => dayKey(toTs(day) + n * D);
const diffDays = (a, b) => Math.round((toTs(b) - toTs(a)) / D);
const wdOf = day => new Date(toTs(day)).getDay();                    // 0 = 周日
const weekStart = day => addDays(day, -((wdOf(day) + 6) % 7));       // 周一为一周的开始
const lastOfMonth = (y, m) => new Date(y, m, 0).getDate();           // m 为 1–12
/** 加几个月，日号超出就取月末（1 月 31 日 + 1 月 = 2 月 28 / 29 日） */
function addMonths(day, n, dom){
  const [y, m, d] = day.split("-").map(Number), idx = y * 12 + (m - 1) + n, ny = Math.floor(idx / 12), nm = idx % 12 + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(dom || d, lastOfMonth(ny, nm)))}`;
}

/* ---- 时间粒度：一个日期落在哪个周 / 月 / 季 / 年 ---- */
function periodStart(period, day){
  const [y, m] = day.split("-").map(Number);
  if (period === "week") return weekStart(day);
  if (period === "month") return `${y}-${pad(m)}-01`;
  if (period === "quarter") return `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
  if (period === "year") return `${y}-01-01`;
  return day;
}
function periodEnd(period, day){
  const [y, m] = day.split("-").map(Number);
  if (period === "week") return addDays(weekStart(day), 6);
  if (period === "month") return `${y}-${pad(m)}-${pad(lastOfMonth(y, m))}`;
  if (period === "quarter") { const qm = Math.floor((m - 1) / 3) * 3 + 3; return `${y}-${pad(qm)}-${pad(lastOfMonth(y, qm))}`; }
  if (period === "year") return `${y}-12-31`;
  return day;
}
const PERIOD_MONTHS = { month: 1, quarter: 3, year: 12 };

/* ---- 重复：recur = { freq: 'day'|'week'|'month'|'year', every, days:[0..6], mday, until, after } ----
   after = true：完成后再隔 every 个单位（洗车）；否则按固定节奏（每周一三五、每月 15 号）。
   period 不是 day 的任务（每季度体检）：every 数的是“周期”，freq 不起作用。 */
function stepFrom(tk, d){
  const r = tk.recur, every = Math.max(1, +r.every || 1), period = tk.period || "day";
  if (period !== "day") {
    const shifted = period === "week" ? addDays(d, 7 * every) : addMonths(d, PERIOD_MONTHS[period] * every);
    return periodEnd(period, shifted);
  }
  if (r.freq === "day") return addDays(d, every);
  if (r.freq === "week") {
    const days = (r.days || []).map(Number).filter(x => x >= 0 && x <= 6);
    if (!days.length) return addDays(d, 7 * every);
    for (let i = 1; i <= 7; i++) { const c = addDays(d, i); if (days.includes(wdOf(c)) && (every === 1 || weekStart(c) === weekStart(d))) return c; }
    // every > 1 且本周已经没有了：跳到 every 周后的那一周，取这一周里最早的那天
    const ws = addDays(weekStart(d), 7 * every);
    for (let i = 0; i < 7; i++) { const c = addDays(ws, i); if (days.includes(wdOf(c))) return c; }
    return addDays(d, 7 * every);
  }
  if (r.freq === "month") return addMonths(d, every, +r.mday || undefined);
  if (r.freq === "year") return addMonths(d, 12 * every);
  return null;
}
/** 完成后这条任务的下一个到期日；没有下一次（超过 until、不重复）返回 null。固定节奏的会跳过已经错过的日子 */
function nextDue(tk, doneDay){
  const r = tk.recur; if (!r || !r.freq && !tk.period) return null;
  const period = tk.period || "day";
  let n;
  if (r.after) n = stepFrom(tk, period === "day" ? doneDay : periodEnd(period, doneDay)) ;
  else { n = stepFrom(tk, tk.due || doneDay); for (let i = 0; i < 400 && n && n <= doneDay; i++) n = stepFrom(tk, n); }
  if (!n) return null;
  if (r.until && n > r.until) return null;
  return n;
}
/** from..to 之间这条任务出现的日期（计划视图用）。不重复 / 完成后重复的只有当前的 due */
function expand(tk, from, to){
  if (!tk.due) return [];
  if (!tk.recur || tk.recur.after) return tk.due >= from && tk.due <= to ? [tk.due] : [];
  const out = []; let d = tk.due;
  for (let i = 0; i < 800 && d && d <= to; i++) {
    if (d >= from) out.push(d);
    if (tk.recur.until && d >= tk.recur.until) break;
    d = stepFrom(tk, d);
    if (tk.recur.until && d && d > tk.recur.until) break;
  }
  return out;
}
const WD_NAME = ["日", "一", "二", "三", "四", "五", "六"];
/** 重复规则的一句话描述（t 是翻译函数） */
function recurText(tk, t){
  const r = tk.recur; if (!r) return "";
  const every = Math.max(1, +r.every || 1), after = r.after ? t("完成后") : "";
  if ((tk.period || "day") !== "day") return `${after}${every === 1 ? t({ week: "每周", month: "每月", quarter: "每季度", year: "每年" }[tk.period]) : t("每 {n} 个周期", { n: every })}`;
  if (r.freq === "day") return `${after}${every === 1 ? t("每天") : t("每 {n} 天", { n: every })}`;
  if (r.freq === "week") { const days = (r.days || []).map(Number); return `${after}${every === 1 ? t("每周") : t("每 {n} 周", { n: every })}${days.length && !r.after ? days.map(d => t(WD_NAME[d])).join("") : ""}`; }
  if (r.freq === "month") return `${after}${every === 1 ? t("每月") : t("每 {n} 个月", { n: every })}${r.mday && !r.after ? t("{d} 号", { d: r.mday }) : ""}`;
  if (r.freq === "year") return `${after}${every === 1 ? t("每年") : t("每 {n} 年", { n: every })}`;
  return "";
}

/* ---- 一句话快速添加：“明天 9 点 给妈妈打电话 #家庭 !高 30分钟” ----
   解析不出来的部分原样当标题。cats 是 [{id, name, subs:[{id,name}]}]，#名称 匹配大类或小类（也可以写 #大类/小类）。
   返回 { title, due, period, start_time, dur, prio, cat, sub }，没解析到的字段是 undefined。 */
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const num = s => (/^\d+$/.test(s) ? +s : CN_NUM[s] || null);
function parseQuick(text, today, cats = []){
  let s = " " + String(text || "") + " ", out = {};
  const take = (re, fn) => { const m = s.match(re); if (m) { s = s.replace(re, " "); fn(m); } return !!m; };
  // 分类
  take(/#([^\s#!]+)/, m => {
    const [a, b] = m[1].split("/"), cat = cats.find(c => c.name === a || c.id === a);
    if (cat) { out.cat = cat.id; const sub = b && cat.subs.find(x => x.name === b || x.id === b); if (sub) out.sub = sub.id; return; }
    for (const c of cats) { const sub = c.subs.find(x => x.name === a || x.id === a); if (sub) { out.cat = c.id; out.sub = sub.id; return; } }
    s += " #" + m[1];   // 认不出的 #标签留在标题里
  });
  // 优先级
  take(/!(高|中|低|[123]|!{0,2})(?![^\s])/, m => { const v = m[1]; out.prio = v === "高" ? 3 : v === "中" ? 2 : v === "低" ? 1 : /^\d$/.test(v) ? +v : 1 + v.length; });
  // 时长
  take(/(\d+(?:\.\d+)?)\s*(?:个)?小时/, m => { out.dur = Math.round(parseFloat(m[1]) * 60); });
  take(/(\d+)\s*(?:分钟|分|min)/i, m => { out.dur = (out.dur || 0) + +m[1]; });
  // 时间
  const pm = x => /下午|晚上|晚|傍晚/.test(x || "");
  if (!take(/(上午|早上|早|下午|晚上|晚|中午)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/, m => { let h = +m[2]; if (pm(m[1]) && h < 12) h += 12; out.start_time = `${pad(h)}:${m[3]}`; })) {
    take(/(上午|早上|早|下午|晚上|晚|中午)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,2})\s*点\s*(半|整|(\d{1,2})\s*分?)?/, m => {
      let h = num(m[2]); if (h == null) return; if (pm(m[1]) && h < 12) h += 12;
      const min = m[3] === "半" ? 30 : m[4] ? +m[4] : 0; out.start_time = `${pad(h)}:${pad(min)}`;
    });
  }
  // 日期
  const set = (due, period) => { out.due = due; if (period) out.period = period; };
  const wdNum = c => ({ 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 })[c];
  if (take(/(\d{4})-(\d{1,2})-(\d{1,2})/, m => set(`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`))) { /* 完整日期 */ }
  else if (take(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/, m => { let y = +today.slice(0, 4), d = `${y}-${pad(+m[1])}-${pad(+m[2])}`; if (d < today) d = `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`; set(d); })) { /* 几月几日 */ }
  else if (take(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?!\d)/, m => { let y = +today.slice(0, 4), d = `${y}-${pad(+m[1])}-${pad(+m[2])}`; if (d < today) d = `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`; set(d); })) { /* 3/15 */ }
  else if (take(/大后天/, () => set(addDays(today, 3)))) { /* */ }
  else if (take(/后天/, () => set(addDays(today, 2)))) { /* */ }
  else if (take(/明天|明日/, () => set(addDays(today, 1)))) { /* */ }
  else if (take(/今天|今日|今晚/, () => set(today))) { /* */ }
  else if (take(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/, m => set(addDays(weekStart(today), 7 + ((wdNum(m[1]) + 6) % 7))))) { /* 下周三 */ }
  else if (take(/(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])/, m => { const target = (wdNum(m[1]) + 6) % 7, cur = (wdOf(today) + 6) % 7; set(addDays(weekStart(today), target < cur ? target + 7 : target)); })) { /* 周五：今天或之后最近的那个周五 */ }
  else if (take(/下(?:个)?(?:周|星期)(?![一二三四五六日天])/, () => set(periodEnd("week", addDays(today, 7)), "week"))) { /* 下周（不指定哪天） */ }
  else if (take(/(?:这|本)(?:个)?(?:周|星期)(?![一二三四五六日天])/, () => set(periodEnd("week", today), "week"))) { /* 本周 */ }
  else if (take(/下(?:个)?月/, () => set(periodEnd("month", addMonths(today, 1, 1)), "month"))) { /* */ }
  else if (take(/(?:这|本)(?:个)?月/, () => set(periodEnd("month", today), "month"))) { /* */ }
  else if (take(/本季度|这季度|本季/, () => set(periodEnd("quarter", today), "quarter"))) { /* */ }
  else if (take(/今年|本年度|本年/, () => set(periodEnd("year", today), "year"))) { /* */ }
  out.title = s.replace(/\s+/g, " ").trim();
  return out;
}

export { addDays, addMonths, diffDays, wdOf, weekStart, periodStart, periodEnd, nextDue, expand, recurText, parseQuick, WD_NAME };
