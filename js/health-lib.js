/* ============ 家人健康 · 纯逻辑（不碰 DOM / 网络，tests/health-lib.test.mjs 有单测） ============
   单位换算、BMI、化验偏高偏低、走势序列（在家测量 + 就诊体征 + 小月亮的成长记录合在一起）、待办（复诊 / 年度体检 / 复查化验 / 体征提示）、
   AI 读图结果的整理。数据库统一公制：kg、cm、°C、mg/dL、mmHg。 */
import { LABS, VITAL_RULES, YEARLY_LABS } from "./data/health-ref.js";

const r1 = v => Math.round(v * 10) / 10;
const num = v => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const DAY = 86400e3;
const dayMs = d => new Date(d + "T12:00:00").getTime();
const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);   // b − a
const addDays = (d, n) => new Date(dayMs(d) + n * DAY).toISOString().slice(0, 10);

/* ---- 单位：sys = "metric" | "us" ---- */
const UNITS = {
  weight:  { metric: ["kg", v => v, v => v], us: ["lb", v => v * 2.20462, v => v / 2.20462] },
  length:  { metric: ["cm", v => v, v => v], us: ["in", v => v / 2.54, v => v * 2.54] },
  temp:    { metric: ["°C", v => v, v => v], us: ["°F", v => v * 9 / 5 + 32, v => (v - 32) * 5 / 9] },
  glucose: { metric: ["mmol/L", v => v / 18, v => v * 18], us: ["mg/dL", v => v, v => v] },
  mmhg:    { metric: ["mmHg", v => v, v => v], us: ["mmHg", v => v, v => v] },
  bpm:     { metric: ["bpm", v => v, v => v], us: ["bpm", v => v, v => v] },
  pct:     { metric: ["%", v => v, v => v], us: ["%", v => v, v => v] },
  bmi:     { metric: ["", v => v, v => v], us: ["", v => v, v => v] }
};
const unitOf = (dim, sys) => (UNITS[dim] ? UNITS[dim][sys === "us" ? "us" : "metric"][0] : "");
const toShow = (dim, v, sys) => (v == null || !UNITS[dim] ? v : r1(UNITS[dim][sys === "us" ? "us" : "metric"][1](+v)));
const fromShow = (dim, v, sys) => (v == null || v === "" || !UNITS[dim] ? null : Math.round(UNITS[dim][sys === "us" ? "us" : "metric"][2](+v) * 100) / 100);

/* ---- 小工具 ---- */
function ageYears(birth, today){
  if (!birth) return null;
  const b = new Date(birth + "T12:00:00"), t = new Date(today + "T12:00:00");
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
const bmiOf = (kg, cm) => (kg > 0 && cm > 0 ? r1(kg / ((cm / 100) ** 2)) : null);
/** 化验一行偏高 / 偏低（按这一行自己存的参考范围） */
function labFlag(x){
  const v = num(x.value); if (v == null) return null;
  if (x.ref_high != null && v > +x.ref_high) return "high";
  if (x.ref_low != null && v < +x.ref_low) return "low";
  return null;
}
const labName = (x, lang = "zh") => (x.code && LABS[x.code] ? (lang === "en" ? LABS[x.code].en : LABS[x.code].name) : x.name || x.code || "");

/* ---- 指标与走势序列 ----
   metric：weight / height / bmi / bp / hr / glucose / temp / waist / spo2 / lab:<code 或 名字>
   data：{ visits, labs, measures, growth }，都已经是这个人的；growth = 小月亮的 [{ day, weight_kg, height_cm }] */
const VITAL_KEY = { weight: "weight_kg", height: "height_cm", hr: "hr", temp: "temp_c", spo2: "spo2" };
function series(metric, data, { heightCm = null } = {}){
  const out = [];
  const push = (day, v, v2, src) => { if (v == null) return; out.push(v2 == null ? { day, v: +v, src } : { day, v: +v, v2: +v2, src }); };
  const { visits = [], labs = [], measures = [], growth = [] } = data;
  if (metric.startsWith("lab:")) {
    const k = metric.slice(4);
    for (const x of labs) if ((x.code || x.name) === k) push(x.day, num(x.value), null, "lab");
  } else if (metric === "bmi") {
    const h = series("height", data);
    const hAt = day => { let cm = heightCm; for (const p of h) if (p.day <= day) cm = p.v; return cm || (h[0] && h[0].v) || null; };
    for (const p of series("weight", data)) push(p.day, bmiOf(p.v, hAt(p.day)), null, p.src);
  } else if (metric === "bp") {
    for (const m of measures) if (m.kind === "bp") push(m.day, num(m.value), num(m.value2), "home");
    for (const v of visits) if (v.vitals && num(v.vitals.sys)) push(v.day, num(v.vitals.sys), num(v.vitals.dia), "visit");
  } else {
    for (const m of measures) if (m.kind === metric) push(m.day, num(m.value), null, "home");
    const vk = VITAL_KEY[metric];
    if (vk) for (const v of visits) if (v.vitals) push(v.day, num(v.vitals[vk]), null, "visit");
    if (metric === "glucose") for (const x of labs) if (x.code === "glucose") push(x.day, num(x.value), null, "lab");
    if (metric === "weight") for (const g of growth) push(g.day, num(g.weight_kg), null, "growth");
    if (metric === "height") for (const g of growth) push(g.day, num(g.height_cm), null, "growth");
  }
  // 同一天同一来源只留最后一条；按日期排
  const seen = new Map(); for (const p of out) seen.set(p.day + "|" + p.src, p);
  return [...seen.values()].sort((a, b) => a.day.localeCompare(b.day));
}
/** 这个人有数据的指标（概览卡片的顺序）：大人先体重 / BMI / 血压，再化验；孩子先身高体重 */
function metricsOf(data, { kid = false, heightCm = null } = {}){
  const base = kid ? ["height", "weight", "temp"] : ["weight", "bmi", "bp", "hr", "glucose", "waist", "spo2"];
  const have = base.filter(m => series(m, data, { heightCm }).length);
  const labKeys = [...new Set((data.labs || []).map(x => x.code || x.name).filter(Boolean))]
    .filter(k => !(k === "glucose" && have.includes("glucose")))
    .sort((a, b) => (Object.keys(LABS).indexOf(a) + 1 || 99) - (Object.keys(LABS).indexOf(b) + 1 || 99));
  return [...have, ...labKeys.map(k => "lab:" + k)];
}
/** 最新一点 + 和上一点比的变化 */
function latest(s){
  if (!s.length) return null;
  const a = s[s.length - 1], b = s.length > 1 ? s[s.length - 2] : null;
  return { ...a, prev: b, delta: b ? r1(a.v - b.v) : null };
}
/** 某个指标最新值的提示：{ level, text } 或 null（化验按那一行的参考范围；体征按 VITAL_RULES，只对大人） */
function metricFlag(metric, point, data, { kid = false } = {}){
  if (!point) return null;
  if (metric.startsWith("lab:")) {
    const k = metric.slice(4), row = [...(data.labs || [])].filter(x => (x.code || x.name) === k && x.day === point.day).pop();
    const f = row ? labFlag(row) : null;
    return f ? { level: f, text: f === "high" ? "偏高" : "偏低" } : null;
  }
  if (kid) return metric === "temp" ? VITAL_RULES.temp_c(point.v) : null;
  if (metric === "bp") return VITAL_RULES.bp(point.v, point.v2);
  if (metric === "hr") return VITAL_RULES.hr(point.v);
  if (metric === "spo2") return VITAL_RULES.spo2(point.v);
  if (metric === "temp") return VITAL_RULES.temp_c(point.v);
  if (metric === "bmi") return VITAL_RULES.bmi(point.v);
  if (metric === "glucose") return point.v > 99 ? { level: "high", text: "偏高" } : point.v < 70 ? { level: "low", text: "偏低" } : null;
  return null;
}

/* ---- 待办：复诊、年度体检、复查化验、体征提示 ----
   返回 [{ level: "due" | "soon" | "info", kind, title, detail, day, ref }]，按要紧程度和日期排。title / detail 是简体键（带 {变量}），显示时 t() */
function dueItems({ data, today, kid = false }){
  const out = [], { visits = [], labs = [] } = data;
  const sorted = [...visits].sort((a, b) => a.day.localeCompare(b.day));
  // 复诊：填了复诊日期，之后还没有新的就诊（复诊前 3 天起的就诊都算这次复诊）
  for (const v of sorted) {
    if (!v.follow_up) continue;
    const done = sorted.some(w => w.id !== v.id && w.day >= addDays(v.follow_up, -3) && w.day > v.day);
    if (done) continue;
    const d = daysBetween(today, v.follow_up);
    if (d < -14) continue;   // 过了两周还没记：多半去过了只是没记，不再一直提醒
    out.push({ level: d <= 0 ? "due" : d <= 14 ? "soon" : "info", kind: "followup", title: "复诊：{who}", vars: { who: v.provider || v.reason || "" }, day: v.follow_up, days: d, ref: v.id });
  }
  if (!kid) {
    // 年度体检：上次距今 ≥ 11 个月，或者还没记过
    const last = sorted.filter(v => v.kind === "annual").pop();
    const gap = last ? daysBetween(last.day, today) : null;
    if (!last) out.push({ level: "info", kind: "annual", title: "还没有年度体检记录", day: null, days: null });
    else if (gap >= 335) out.push({ level: gap >= 365 ? "due" : "soon", kind: "annual", title: "该做年度体检了", vars: { d: last.day }, detail: "上次 {d}", day: addDays(last.day, 365), days: daysBetween(today, addDays(last.day, 365)), ref: last.id });
    // 复查化验：每项最新一次；异常且 ≥ 90 天，或常规项目正常但 ≥ 365 天
    const byKey = new Map(); for (const x of [...labs].sort((a, b) => a.day.localeCompare(b.day))) byKey.set(x.code || x.name, x);
    for (const [k, x] of byKey) {
      const f = labFlag(x), gapL = daysBetween(x.day, today);
      if (f && gapL >= 90) out.push({ level: gapL >= 180 ? "due" : "soon", kind: "lab", title: "复查 {name}", vars: { name: k, last: x.day, v: x.value }, detail: "上次 {last} 是 {v}，超出参考范围", day: addDays(x.day, 90), days: daysBetween(today, addDays(x.day, 90)), ref: k });
      else if (!f && YEARLY_LABS.includes(k) && gapL >= 365) out.push({ level: "soon", kind: "lab", title: "复查 {name}", vars: { name: k, last: x.day }, detail: "上次 {last}，一般一年查一次", day: addDays(x.day, 365), days: daysBetween(today, addDays(x.day, 365)), ref: k });
    }
  }
  const rank = { due: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.day || "9").localeCompare(b.day || "9"));
}

/* ---- AI 读图结果整理 ----
   期望模型返回：{ day, kind, provider, reason, vitals: { weight_kg, height_cm, sys, dia, hr, temp_c, spo2 }, diagnosis, advice, follow_up,
   labs: [{ name, code?, value, unit, ref_low?, ref_high?, day? }] }。单位可能是美制：weight_lb / height_in / temp_f 也认。认不出的字段丢掉 */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseExtract(text){
  let o; try { o = typeof text === "string" ? JSON.parse(String(text).replace(/^```(json)?|```$/g, "").trim()) : text; } catch (e) { return null; }
  if (!o || typeof o !== "object") return null;
  const v = o.vitals || {};
  const vit = {
    weight_kg: num(v.weight_kg) ?? (num(v.weight_lb) != null ? Math.round(num(v.weight_lb) / 2.20462 * 100) / 100 : null),
    height_cm: num(v.height_cm) ?? (num(v.height_in) != null ? Math.round(num(v.height_in) * 2.54 * 10) / 10 : null),
    sys: num(v.sys), dia: num(v.dia), hr: num(v.hr), spo2: num(v.spo2),
    temp_c: num(v.temp_c) ?? (num(v.temp_f) != null ? r1((num(v.temp_f) - 32) * 5 / 9) : null)
  };
  Object.keys(vit).forEach(k => { if (vit[k] == null) delete vit[k]; });
  const kinds = ["annual", "regular", "urgent", "er", "specialist", "dental", "vision", "tele", "other"];
  const guessCode = (name, code) => labCodeOf(name, code);
  // 化验单上的范围就用单子上的（只写了一边就只有一边）；单子上完全没写范围才用默认的
  const seen = new Set();
  const labs = (Array.isArray(o.labs) ? o.labs : []).map(x => {
    const value = num(x && x.value); if (value == null) return null;
    const code = guessCode(x.name, x.code), ref = code ? LABS[code] : null;
    const lo = num(x.ref_low), hi = num(x.ref_high), given = lo != null || hi != null;
    const k = (code || String(x.name || "").toLowerCase()) + "|" + value; if (seen.has(k)) return null; seen.add(k);   // 几张照片重叠的那一项只留一次
    return { code, name: String(x.name || (ref ? ref.en : "")).slice(0, 80), value, unit: String(x.unit || (ref ? ref.unit : "")).slice(0, 20),
      ref_low: given ? lo : ref ? ref.low : null, ref_high: given ? hi : ref ? ref.high : null, day: DATE.test(x.day || "") ? x.day : null };
  }).filter(Boolean).slice(0, 80);
  return {
    day: DATE.test(o.day || "") ? o.day : null, kind: kinds.includes(o.kind) ? o.kind : null,
    provider: String(o.provider || "").slice(0, 120), reason: String(o.reason || "").slice(0, 300),
    vitals: vit, diagnosis: String(o.diagnosis || "").slice(0, 2000), advice: String(o.advice || "").slice(0, 4000),
    follow_up: DATE.test(o.follow_up || "") ? o.follow_up : null, labs, fasting: o.fasting === true || /^(yes|是|y)$/i.test(String(o.fasting || ""))
  };
}
const EXTRACT_SYSTEM = `You read photos (possibly several pages or screenshots of a patient portal such as MyChart) or pasted text of medical after-visit summaries and lab reports. Return ONLY JSON with this shape:
{"day":"YYYY-MM-DD|null","kind":"annual|regular|urgent|er|specialist|dental|vision|tele|other|null","provider":"clinic or doctor","reason":"chief complaint",
"vitals":{"weight_kg":n,"weight_lb":n,"height_cm":n,"height_in":n,"sys":n,"dia":n,"hr":n,"temp_c":n,"temp_f":n,"spo2":n},
"diagnosis":"text","advice":"the doctor's instructions / plan, verbatim where possible","follow_up":"YYYY-MM-DD|null",
"fasting":true|false|null,
"labs":[{"name":"test name as printed","value":n,"unit":"unit","ref_low":n|null,"ref_high":n|null,"day":"YYYY-MM-DD|null"}]}
Include every numeric result on every page (lipid panel, comprehensive metabolic panel, CBC, A1c, thyroid, vitamins...), each once. "day" is the collection date ("Collected on ...").
Reference ranges: "74 - 109" -> ref_low 74, ref_high 109; "150 or below" / "below 5.0" / "<130" -> ref_high only; "40 or above" / ">=60" -> ref_low only; no range printed -> both null.
Skip non-numeric results except "Patient Fasting?" which goes to "fasting". Omit fields you cannot read. Never invent values. Do not include any patient names, dates of birth, addresses, phone numbers or ID numbers.`;

/* ---- 化验项目：名字对代码、套餐、范围 ---- */
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim();
/** 化验单上的名字 → 内置代码（先整名对：英文名、中文名、alias、代码；再按最长的 alias 包含）；对不上返回 "" */
function labCodeOf(name, code){
  if (code && LABS[code]) return code;
  const n = norm(name); if (!n) return "";
  const names = c => [c, LABS[c].en, LABS[c].name, ...(LABS[c].alias || [])].map(norm);
  for (const c of Object.keys(LABS)) if (names(c).includes(n)) return c;
  let best = "", len = 0;
  for (const c of Object.keys(LABS)) for (const a of names(c)) if (a.length > 2 && a.length > len && (` ${n} `).includes(` ${a} `)) { best = c; len = a.length; }
  return best;
}
const labGroupOf = x => (x && x.code && LABS[x.code] ? LABS[x.code].group : "other");
const rangeText = x => (x.ref_low != null && x.ref_high != null ? `${+x.ref_low}–${+x.ref_high}` : x.ref_high != null ? `≤ ${+x.ref_high}` : x.ref_low != null ? `≥ ${+x.ref_low}` : "");
/** 范围条上的位置：{ lo, hi, at }（0–100，正常段在 25–75；只有一边的，另一边按数值留出余量） */
function rangeBar(x){
  const v = num(x.value), lo = x.ref_low != null ? +x.ref_low : null, hi = x.ref_high != null ? +x.ref_high : null;
  if (v == null || (lo == null && hi == null)) return null;
  const a = lo != null ? lo : Math.min(0, v), b = hi != null ? hi : Math.max(lo * 2, v * 1.25);
  const span = b - a || 1, left = a - span / 2, right = b + span / 2;
  const pos = q => Math.max(0, Math.min(100, (q - left) / (right - left) * 100));
  return { lo: lo != null ? pos(lo) : 0, hi: hi != null ? pos(hi) : 100, at: pos(v) };
}
/** 大人 / 孩子的体征指标（关键指标卡片），化验另外按套餐显示 */
const vitalMetricsOf = (data, { kid = false, heightCm = null } = {}) => metricsOf(data, { kid, heightCm }).filter(m => !m.startsWith("lab:") && (m !== "glucose" || (data.measures || []).some(x => x.kind === "glucose")));   // 化验的血糖在化验结果里，卡片只放在家测的

export { labCodeOf, labGroupOf, rangeText, rangeBar, vitalMetricsOf };
export { UNITS, unitOf, toShow, fromShow, ageYears, bmiOf, labFlag, labName, series, metricsOf, latest, metricFlag, dueItems, parseExtract, EXTRACT_SYSTEM, daysBetween, addDays };
