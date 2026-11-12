/* ============ 家人健康 · 概览的「AI 健康分析」纯逻辑（2026-11-11；tests/health-review-lib.test.mjs 有单测） ============
   三种范围（用户点了才发；去掉姓名，只发年龄、性别、档案里的病史 / 用药 / 过敏 / 目标）：
     whole  全盘：所有就诊（最近 20 次）、每项化验的历次结果（每项最近 6 次）、体征走势（每项最近 8 个点）、最近 4 周的训练和饮食照做情况；
     recent 最近一次：最近一次就诊（连同那次的化验），如果之后又单独做过化验，也带上那一天的化验；每项附上一次的值做对比；
     watch  需要留意：最新一次超出范围的化验（附历次）、贴近范围边缘的化验、偏高 / 偏低的体征、到期的复诊 / 复查 / 体检。
   目的不是吓人：先说做得好的，再给 1–4 个最值得加强的方向，以及就医、饮食（多吃 / 少吃或先停一阵）、睡眠、运动的具体建议和复诊时要问的问题。 */
import { LABS } from "./data/health-ref.js";
import { addDays, ageYears, dueItems, labFlag, latest, metricFlag, series } from "./health-lib.js";

const MODES = ["whole", "recent", "watch"];
const VITALS = kid => (kid ? ["height", "weight"] : ["weight", "bmi", "waist", "bp", "hr", "glucose", "spo2"]);
const AREAS = ["medical", "diet", "sleep", "exercise", "weight", "stress", "other"];
const keyOf = x => x.code || x.name;
const testName = x => (x.code && LABS[x.code] ? LABS[x.code].en : x.name || x.code);
const cut = (s, n) => String(s || "").slice(0, n);
const byDay = (a, b) => a.day.localeCompare(b.day);
const labRow = x => ({ date: x.day, value: +x.value, flag: labFlag(x) });
const labHead = x => ({ test: testName(x), unit: x.unit || "", ref_low: x.ref_low ?? null, ref_high: x.ref_high ?? null });
const visitRow = v => ({ date: v.day, kind: v.kind, reason: cut(v.reason, 200), diagnosis: cut(v.diagnosis, 300), doctor_advice: cut(v.advice, 600), follow_up: v.follow_up || null });

/** 化验按项目分组，组内按日期升序 */
function labsByKey(labs){
  const m = new Map();
  for (const x of [...labs].sort(byDay)) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
/** 贴近范围边缘：在范围内，但离上限或下限不到范围宽度的 10%（只在两头都有时算） */
function borderline(x){
  if (labFlag(x) || x.ref_low == null || x.ref_high == null) return null;
  const v = +x.value, lo = +x.ref_low, hi = +x.ref_high, w = hi - lo;
  if (!(w > 0)) return null;
  return hi - v <= w * 0.1 ? "near_high" : v - lo <= w * 0.1 ? "near_low" : null;
}
/** 体征：每项最近 n 个点 */
function vitalsOf(data, { heightCm, kid, n = 8 }){
  const out = {};
  for (const m of VITALS(kid)) { const s = series(m, data, { heightCm }); if (s.length) out[m] = s.slice(-n).map(p => (p.v2 != null ? { date: p.day, v: p.v, v2: p.v2 } : { date: p.day, v: p.v })); }
  return out;
}
/** 训练 / 饮食：最近 7 天和 28 天 */
function activityOf(activity = [], today){
  const sum = from => { const w = activity.filter(a => a.day >= from && a.day <= today);
    const work = w.filter(a => a.kind === "workout"), meals = w.filter(a => a.kind === "meal");
    const followed = meals.filter(m => (m.data || {}).followed === "yes").length + meals.filter(m => (m.data || {}).followed === "partly").length * 0.5;
    return { workout_minutes: work.reduce((s, a) => s + (+a.minutes || 0), 0), workouts: work.length, meals_logged: meals.length, meals_followed_pct: meals.length ? Math.round(followed / meals.length * 100) : null }; };
  return activity.length ? { last_7_days: sum(addDays(today, -6)), last_28_days: sum(addDays(today, -27)) } : null;
}
/** 最近一次：最近的就诊，以及之后单独做的化验那一天 */
function recentEvent(data){
  const v = [...(data.visits || [])].sort(byDay).pop() || null;
  const labs = [...(data.labs || [])].sort(byDay), lastLab = labs.length ? labs[labs.length - 1].day : null;
  const visitLabs = v ? labs.filter(x => x.visit_id === v.id || x.day === v.day) : [];
  const laterDay = lastLab && (!v || lastLab > v.day) ? lastLab : null;
  const laterLabs = laterDay ? labs.filter(x => x.day === laterDay && !visitLabs.includes(x)) : [];
  return { visit: v, visitLabs, laterDay, laterLabs, day: laterDay || (v && v.day) || null };
}
/** 某次化验：附上这一项之前那一次的值 */
function withPrev(x, all){
  const rows = (all.get(keyOf(x)) || []).filter(y => y.day < x.day), p = rows[rows.length - 1];
  return { ...labHead(x), ...labRow(x), previous: p ? labRow(p) : null };
}

/** 给模型的输入（不含姓名）；plan = { diet, workout } 当前计划的模版名，可空 */
function reviewInput(mode, { data, profile = {}, birth = null, kid = false, today, plan = null }){
  const ctx = { mode, today, kid, age: ageYears(profile.birth || birth, today), sex: profile.sex || null,
    history: cut(profile.conditions, 600), medications: cut(profile.meds, 400), allergies: cut(profile.allergies, 300), goals: cut(profile.goals, 300) };
  const heightCm = profile.height_cm || null, all = labsByKey(data.labs || []);
  if (mode === "recent") {
    const e = recentEvent(data);
    return { ...ctx, visit: e.visit ? { ...visitRow(e.visit), vitals: e.visit.vitals || {} } : null, visit_labs: e.visitLabs.map(x => withPrev(x, all)),
      later_labs: e.laterLabs.length ? { date: e.laterDay, results: e.laterLabs.map(x => withPrev(x, all)) } : null };
  }
  if (mode === "watch") {
    const flagged = [], near = [];
    for (const rows of all.values()) { const x = rows[rows.length - 1];
      if (labFlag(x)) flagged.push({ ...labHead(x), results: rows.slice(-4).map(labRow) });
      else { const b = borderline(x); if (b) near.push({ ...labHead(x), ...labRow(x), position: b }); } }
    const vit = [];
    for (const m of VITALS(kid)) { const l = latest(series(m, data, { heightCm })), f = metricFlag(m, l, data, { kid }); if (f) vit.push({ vital: m, date: l.day, v: l.v, ...(l.v2 != null ? { v2: l.v2 } : {}), flag: f.level }); }
    const due = dueItems({ data, today, kid }).map(d => ({ kind: d.kind, level: d.level, date: d.day, days: d.days, test: d.kind === "lab" ? testName({ code: LABS[d.vars.name] ? d.vars.name : "", name: d.vars.name }) : undefined }));
    return { ...ctx, out_of_range_labs: flagged, near_limit_labs: near, flagged_vitals: vit, due, recent_advice: [...(data.visits || [])].sort(byDay).slice(-3).map(visitRow) };
  }
  // whole
  return { ...ctx, visits: [...(data.visits || [])].sort(byDay).slice(-20).map(visitRow),
    labs: [...all.values()].map(rows => ({ ...labHead(rows[rows.length - 1]), results: rows.slice(-6).map(labRow) })),
    vitals: vitalsOf(data, { heightCm, kid }), activity: activityOf(data.activity, today), current_plan: plan };
}
/** 有没有东西可分析 */
function hasInput(mode, input){
  if (mode === "recent") return !!(input.visit || input.visit_labs.length || input.later_labs);
  if (mode === "watch") return true;   // 都正常也可以分析：给保持的建议
  return !!(input.visits.length || input.labs.length || Object.keys(input.vitals).length);
}
/** 记录数：分析之后又记了几条（提示可以重新分析） */
const stampOf = data => (data.visits || []).length + (data.labs || []).length + (data.measures || []).length;

const SCOPE = {
  whole: "Look at the whole history: long-term trends across all visits, labs and vitals, which areas are improving, which are drifting, and what to strengthen next.",
  recent: "Focus on the most recent visit and/or lab day: what it found, how each result moved versus the previous one, and what to do between now and the next visit. Use the background only as context.",
  watch: "Focus only on the items that need attention (out-of-range or near-limit labs, flagged vitals, overdue follow-ups or rechecks). For each, say how much it matters, what most likely helps, and when to recheck. If nothing is flagged, say so plainly and give maintenance advice."
};
const REVIEW_SYSTEM = (lang, mode, kid) => `You are a calm, encouraging family health coach (not a doctor). The goal is NOT to alarm; it is to turn the data into practical next steps: follow-up care, eating, sleep, exercise, and what to strengthen.
${SCOPE[mode] || SCOPE.whole}
Input: de-identified JSON. Lab flags use the lab's own reference ranges - use them, never your own.
The person may add "user_notes" and attached photos or files (checkup reports, doctor notes): treat them as part of the picture, and say when a point comes from them.
Reply ONLY with JSON:
{"summary":"3-4 sentences, balanced: start with what is going well, then the main thing to work on",
"good":["up to 3 things going well, tied to the data"],
"focus":[{"area":"${AREAS.join("|")}","title":"short label","why":"the data behind it (values and dates)","action":"one concrete thing to do"}],
"medical":["next steps for care: which follow-up or recheck, roughly when, which specialist to ask about - only if supported by the data"],
"eat_more":["specific foods or habits to add"],
"eat_less":["specific foods to cut back on or pause for a few weeks before the recheck, and why"],
"sleep":["sleep advice tied to the data, or general basics if nothing specific"],
"exercise":["type, amount per week and intensity that fits the data and age"],
"ask":["up to 4 questions to bring to the doctor"]}
Rules: "focus" has 1-4 items, most impactful first. Lists have at most 5 short items each; use [] when there is nothing useful. Follow the doctor's advice in the data when it exists. Never diagnose, never suggest starting, stopping or changing medication or supplements doses. If a value suggests prompt care is needed, say so calmly in "medical".${kid ? " This is a child: never mention calories, dieting, fasting or weight loss; focus on balanced meals, play, sleep and the pediatrician." : ""}
Write in ${lang === "en" ? "English" : "Simplified Chinese"}.`;

/** 整理模型返回；不对返回 null */
function parseReview(text){
  let o; try { o = JSON.parse(String(text).replace(/^\s*```(json)?|```\s*$/g, "").trim()); } catch (e) { return null; }
  if (!o || typeof o !== "object") return null;
  const list = (v, n = 5) => (Array.isArray(v) ? v.map(x => cut(typeof x === "string" ? x : "", 300).trim()).filter(Boolean).slice(0, n) : []);
  const focus = (Array.isArray(o.focus) ? o.focus : []).filter(f => f && typeof f === "object" && (f.title || f.action)).slice(0, 4)
    .map(f => ({ area: AREAS.includes(f.area) ? f.area : "other", title: cut(f.title, 80), why: cut(f.why, 300), action: cut(f.action, 300) }));
  const out = { summary: cut(o.summary, 1200), good: list(o.good, 3), focus, medical: list(o.medical), eat_more: list(o.eat_more), eat_less: list(o.eat_less), sleep: list(o.sleep), exercise: list(o.exercise), ask: list(o.ask, 4) };
  return out.summary || focus.length ? out : null;
}

export { MODES, AREAS, reviewInput, hasInput, recentEvent, borderline, stampOf, REVIEW_SYSTEM, parseReview };
