/* ============ 习惯记录页（回顾 → 记录）：纯逻辑 ============
   每条打卡（wb_logs）一行：显示什么、怎么筛、怎么按天分组、编辑表单有哪些字段、表单怎么变回记录。
   不碰页面和数据库（测试见 tests/records-lib.test.mjs）。mode 见 data/kinds.js：check / count / minutes / rating / value / slots。 */
import { RATINGS, kindOf, modeOf } from "./data/kinds.js";
import { PRESETS, whatLabel } from "./hero-presets-lib.js";

const PRESET_REST = PRESETS.rest.items;

const pad = n => String(n).padStart(2, "0");
const dayOfTs = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOfTs = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** 本地日期 + 时间 → 毫秒；时间没填按中午 12:00 */
function toTs(day, time){
  const [y, m, d] = String(day).split("-").map(Number), [h, mi] = /^\d{1,2}:\d{2}$/.test(time || "") ? time.split(":").map(Number) : [12, 0];
  return new Date(y, m - 1, d, h, mi).getTime();
}

/** 这条记录按哪种方式记的（没有对应习惯的读经 / 祷告记录按它自己的种类） */
const modeFor = (log, p) => p ? modeOf(p) : modeOf({ kind: log.kind });
/** 记录的名字：优先用打卡当时存下的名字（data.pname），习惯以后改名不会改掉以前的记录 */
const nameFor = (log, p, t) => log.data && log.data.pname ? log.data.pname : p ? (p.name || t(kindOf(p).label)) : t(kindOf({ kind: log.kind }).label);

/** 一行说明：「30 分钟 · 走路 · 备注」「服了 08:00」「好」… t：翻译函数 */
function logLine(log, p, t){
  const d = log.data || {}, mode = modeFor(log, p), k = kindOf(p || { kind: log.kind });
  let main;
  switch (mode) {
    case "minutes": main = [t("{m} 分钟", { m: d.minutes || 0 }), d.type ? t(d.type) : ""].filter(Boolean).join(" · "); break;
    case "rating": main = t(RATINGS[d.rating] || ""); break;
    case "value": main = d.value != null ? `${d.value} ${t(k.unit || "")}`.trim() : ""; break;
    case "count": main = [d.what ? t(whatLabel(d.what)) : "", d.minutes ? t("{m} 分钟", { m: d.minutes }) : ""].filter(Boolean).join(" · ") || t("做到了"); break;
    case "slots": main = d.taken ? t("服了") : t("跳过"); break;   // 不再附带「时间点」：每行左边已经有真正记下的时间（以前按时间点吃的会显示成 --:--）
    default: main = d.ref ? `${t("读经")} ${d.ref}` : t("做到了");
  }
  return [main, d.note || ""].filter(Boolean).join(" · ");
}

/** 筛选：pid（"all" 或某项习惯）、days（只看最近几天，0 = 不限）、q（搜索说明和备注）；新的在前 */
function filterLogs(logs, { pid = "all", days = 0, q = "", today, line }){
  const from = days ? new Date(toTs(today, "00:00") - (days - 1) * 86400e3) : null, fromDay = from ? dayOfTs(from.getTime()) : "";
  const w = String(q || "").trim().toLowerCase();
  return logs.filter(l => (pid === "all" || l.practice_id === pid) && (!fromDay || l.day >= fromDay) && (!w || line(l).toLowerCase().includes(w)))
    .sort((a, b) => b.ts - a.ts);
}
/** 按天分组（输入已是新的在前）：[{ day, items }] */
function groupByDay(list){
  const out = [];
  for (const l of list) { const g = out[out.length - 1]; if (g && g.day === l.day) g.items.push(l); else out.push({ day: l.day, items: [l] }); }
  return out;
}

/** 编辑 / 补记表单的字段（模式不同字段不同；日期和时间永远有） */
function recFields(mode, opts = {}){
  const f = [{ k: "day", label: "日期", type: "date", past: true, w: "h" }, { k: "time", label: "时间", type: "time", w: "h" }];
  if (mode === "minutes") f.push({ k: "minutes", label: "分钟", type: "num", w: "h" }, { k: "type", label: "类型（可空）", type: "text", ph: "走路、跑步、力量…" });
  if (mode === "count") { if (opts.rest) f.push({ k: "what", label: "哪一项", type: "seg", opts: PRESET_REST.map(i => [i.k, i.label]) }); f.push({ k: "minutes", label: "分钟（可空）", type: "num" }); }
  if (mode === "rating") f.push({ k: "rating", label: "评价", type: "seg", fill: true, opts: Object.entries(RATINGS).sort((a, b) => b[0] - a[0]) });
  if (mode === "value") f.push({ k: "value", label: "数值", type: "num", step: 0.5 });
  if (mode === "slots") f.push({ k: "taken", label: "结果", type: "seg", fill: true, opts: [["1", "服了"], ["0", "跳过"]] }, { k: "slot", label: "对应的时间点（可空）", type: "text", ph: "08:00" });
  f.push({ k: "note", label: "备注（可空）", type: "text" });
  return f;
}
/** 记录 → 表单的初始值 */
function logToDraft(log){
  const d = log.data || {};
  return { day: log.day, time: timeOfTs(log.ts), minutes: d.minutes ?? null, type: d.type || "", rating: d.rating != null ? String(d.rating) : "", value: d.value ?? null,
    taken: d.taken ? "1" : "0", slot: d.slot || "", note: d.note || "", what: d.what || "" };
}
/** 表单 → { day, ts, data }：只改这一种模式用到的字段，其余（如读经的 ref）原样保留 */
function draftToLog(draft, mode, oldData = {}){
  const data = { ...oldData };
  const put = (k, v) => { if (v == null || v === "") delete data[k]; else data[k] = v; };
  if (mode === "minutes") { put("minutes", draft.minutes); put("type", draft.type); }
  if (mode === "count") { put("minutes", draft.minutes); put("what", draft.what); }
  if (mode === "rating") put("rating", draft.rating === "" ? null : +draft.rating);
  if (mode === "value") put("value", draft.value);
  if (mode === "slots") { data.taken = draft.taken === "1"; put("slot", draft.slot); }
  put("note", draft.note);
  return { day: draft.day, ts: toTs(draft.day, draft.time), data };
}
/** 保存前的检查：返回要提示的话，没问题返回 "" */
function recProblem(draft, mode){
  if (!draft.day) return "请选日期";
  if (mode === "minutes" && !(+draft.minutes > 0)) return "请填分钟数";
  if (mode === "rating" && !draft.rating) return "请选一个评价";
  if (mode === "value" && draft.value == null) return "请填一个数";
  return "";
}

export { dayOfTs, timeOfTs, toTs, modeFor, nameFor, logLine, filterLogs, groupByDay, recFields, logToDraft, draftToLog, recProblem };
