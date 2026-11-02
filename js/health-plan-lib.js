/* ============ 家人健康 · 计划的纯逻辑（阶段 2–4；tests/health-plan-lib.test.mjs 有单测） ============
   推荐（规则层）：看最近的化验、体征、BMI、档案里的病史和目标、就诊时医生的建议原文，打上标签（bp / lipid / sugar / weight / muscle / iron），
   每个标签写清依据；再按标签给饮食和训练模版打分。只按公开指南的阈值，不下诊断。
   本周统计：训练分钟（目标每周 150 分钟中等强度；孩子每天 60 分钟）、按饮食模版照做的餐数。
   模版引用：内置 'b:<id>'，家里自建的 'c:<hl_templates.id>'。 */
import { DIETS, WORKOUTS } from "./data/health-plans.js";
import { addDays, ageYears, bmiOf, labFlag, latest, series } from "./health-lib.js";

const KEYWORDS = {
  bp: /血压|高压|低盐|少盐|盐分|钠|sodium|salt|blood pressure|hypertens/i,
  lipid: /血脂|胆固醇|甘油三酯|cholesterol|lipid|ldl|triglyc|statin/i,
  sugar: /血糖|糖尿|糖化|a1c|diabet|glucose|prediabet|insulin/i,
  weight: /减重|减肥|体重|超重|肥胖|lose weight|weight loss|bmi|obes|overweight/i,
  muscle: /增肌|肌肉|力量|muscle|strength training/i,
  iron: /贫血|缺铁|铁蛋白|维生素 ?d|维d|vitamin d|iron|anemi|ferritin/i
};

/** 命中的字眼：英文扩到整个单词（prediabet → prediabetes），中文就是命中的那几个字 */
function hitWord(text, re){
  const m = String(text).match(re); if (!m) return "";
  let a = m.index, b = a + m[0].length; const w = /[A-Za-z0-9-]/;
  if (w.test(m[0])) { while (a > 0 && w.test(text[a - 1])) a--; while (b < text.length && w.test(text[b])) b++; }
  return text.slice(a, b);
}
/** 打标签：返回 { 标签: [{ k: 简体键, vars }] }（依据，显示时 t()） */
function healthTags({ data, profile = {}, kid = false }){
  const tags = {}, add = (tag, k, vars = {}) => { (tags[tag] ||= []).push({ k, vars }); };
  if (kid) { add("kid", "按儿童餐盘法和每天 60 分钟活动（不数热量、不减重）"); return tags; }
  const labsBy = new Map(); for (const x of [...(data.labs || [])].sort((a, b) => a.day.localeCompare(b.day))) labsBy.set(x.code || x.name, x);
  const lab = code => labsBy.get(code);
  const hi = code => { const x = lab(code); return x && labFlag(x) === "high" ? x : null; };
  const lo = code => { const x = lab(code); return x && labFlag(x) === "low" ? x : null; };
  const labVars = x => ({ v: x.value, unit: x.unit || "", d: x.day, r: x.ref_high != null ? `< ${x.ref_high}` : x.ref_low != null ? `> ${x.ref_low}` : "" });
  for (const c of ["ldl", "total_chol", "trig"]) { const x = hi(c); if (x) add("lipid", "{name} {v} {unit}（参考 {r}），{d}", { ...labVars(x), name: c }); }
  { const x = lo("hdl"); if (x) add("lipid", "{name} {v} {unit}（参考 {r}），{d}", { ...labVars(x), name: "hdl" }); }
  for (const c of ["a1c", "glucose"]) { const x = hi(c); if (x) add("sugar", "{name} {v} {unit}（参考 {r}），{d}", { ...labVars(x), name: c }); }
  for (const c of ["vit_d", "ferritin", "hgb"]) { const x = lo(c); if (x) add("iron", "{name} {v} {unit}（参考 {r}），{d}", { ...labVars(x), name: c }); }
  const bp = latest(series("bp", data));
  if (bp && (bp.v >= 130 || (bp.v2 != null && bp.v2 >= 80))) add("bp", "血压 {s}/{d2}（≥ 130/80 算偏高），{d}", { s: bp.v, d2: bp.v2 ?? "–", d: bp.day });
  const b = latest(series("bmi", data, { heightCm: profile.height_cm || null }));
  if (b && b.v >= 25) add("weight", "BMI {v}（≥ 25 算超重），{d}", { v: b.v, d: b.day });
  if (b && b.v < 18.5) add("muscle", "BMI {v}（< 18.5 算偏轻），{d}", { v: b.v, d: b.day });
  // 医生建议、病史、目标里的字眼（最近 18 个月的就诊）
  const recent = [...(data.visits || [])].sort((a, b2) => b2.day.localeCompare(a.day)).slice(0, 6);
  for (const v of recent) for (const [tag, re] of Object.entries(KEYWORDS)) if (re.test(`${v.advice || ""} ${v.diagnosis || ""}`)) add(tag, "{d} 就诊：医生提到「{w}」", { d: v.day, w: hitWord(`${v.advice || ""} ${v.diagnosis || ""}`, re) });
  for (const [field, label] of [["conditions", "病史"], ["goals", "目标"]]) for (const [tag, re] of Object.entries(KEYWORDS)) if (re.test(profile[field] || "")) add(tag, "档案的{f}里有「{w}」", { f: label, w: hitWord(profile[field], re) });
  return tags;
}
/** 给模版打分：模版的 tags 和这个人的标签重合越多越靠前；返回 [{ id, score, hits }] */
function rank(lib, tags, { kid = false } = {}){
  return Object.entries(lib).filter(([, x]) => !!x.kid === kid).map(([id, x]) => {
    const hits = (x.tags || []).filter(tg => tags[tg]);
    const raw = hits.reduce((s, tg) => s + tags[tg].length + 1, 0);
    return { id, score: x.generic ? raw * 0.6 : raw, hits };
  }).sort((a, b) => b.score - a.score);
}
/** 推荐：{ tags, diets: [{ id, hits }], workouts: [{ id, hits }] }（各取前 3；没有标签时给家常少油少盐 + 快走 + 新手全身） */
function recommend({ data, profile = {}, kid = false, today = null }){
  const tags = healthTags({ data, profile, kid });
  if (kid) return { tags, diets: [{ id: "kid_plate", hits: ["kid"] }], workouts: [{ id: "kid_play", hits: ["kid"] }, { id: "kid_family", hits: ["kid"] }] };
  const age = ageYears(profile.birth, today || new Date().toISOString().slice(0, 10));
  const none = !Object.keys(tags).length;
  let diets = none ? [{ id: "home_light", hits: [] }, { id: "med", hits: [] }] : rank(DIETS, tags).filter(x => x.score > 0).slice(0, 3);
  // 训练：血压 / 血脂 / 血糖 / 体重 → 有氧；血糖 / 体重 / 增肌 → 力量；年纪大或没运动基础的先给温和的
  const wTags = { ...tags };
  if (tags.bp || tags.lipid || tags.sugar || tags.weight) wTags.cardio = [{}];
  if (tags.sugar || tags.weight || tags.muscle) wTags.strength = [{}];
  if (age != null && age >= 65) wTags.gentle = [{}, {}];
  let workouts = none ? [{ id: "walk30", hits: [] }, { id: "starter_a", hits: [] }] : rank(WORKOUTS, wTags).filter(x => x.score > 0);
  if (age != null && age >= 65) workouts = workouts.filter(x => (WORKOUTS[x.id].level || 1) <= 2);
  return { tags, diets, workouts: workouts.slice(0, 3) };
}

/* ---- 本周（最近 7 天，含今天）：训练分钟 / 次数、饮食照做的餐数 ---- */
function weekStats({ activity = [], today, kid = false }){
  const from = addDays(today, -6), wk = activity.filter(a => a.day >= from && a.day <= today);
  const work = wk.filter(a => a.kind === "workout"), meals = wk.filter(a => a.kind === "meal");
  const minutes = work.reduce((s, a) => s + (+a.minutes || 0), 0);
  const goal = kid ? 60 * 7 : 150;
  const followed = meals.filter(m => (m.data || {}).followed === "yes").length + meals.filter(m => (m.data || {}).followed === "partly").length * 0.5;
  return { minutes, sessions: work.length, goal, pct: Math.min(100, Math.round(minutes / goal * 100)), meals: meals.length, followed, mealPct: meals.length ? Math.round(followed / meals.length * 100) : null };
}
/** 某天该不该练（计划里的星期几；没设就按模版默认的日子） */
function workoutOn(plan, day){
  const w = plan && plan.workout; if (!w || !w.tpl) return false;
  const days = Array.isArray(w.days) && w.days.length ? w.days : (WORKOUTS[(w.tpl || "").slice(2)] || {}).days || [];
  return days.includes(new Date(day + "T12:00:00").getDay());
}
/** 模版引用 → 模版（内置或自建）：{ src: "b" | "c", id, x } */
function tplOf(ref, kind, custom = []){
  if (!ref) return null;
  const [src, id] = [ref.slice(0, 1), ref.slice(2)];
  if (src === "b") { const x = (kind === "workout" ? WORKOUTS : DIETS)[id]; return x ? { src, id, x } : null; }
  const c = custom.find(r => r.id === id && r.kind === kind); return c ? { src, id, x: { ...(c.data || {}), zh: c.name, en: c.name, custom: true } } : null;
}

/* ---- AI 分析（用户点了才发；去掉姓名）：给模型的摘要和提示词，以及整理返回 ---- */
function aiSummary({ data, profile = {}, kid = false, today }){
  const age = ageYears(profile.birth, today);
  const lastOf = m => { const l = latest(series(m, data, { heightCm: profile.height_cm || null })); return l ? { v: l.v, v2: l.v2, day: l.day } : null; };
  const labsBy = new Map(); for (const x of [...(data.labs || [])].sort((a, b) => a.day.localeCompare(b.day))) labsBy.set(x.code || x.name, x);
  return {
    kid, age, sex: profile.sex || null,
    latest: { weight_kg: lastOf("weight"), bmi: lastOf("bmi"), bp: lastOf("bp"), hr: lastOf("hr") },
    labs: [...labsBy.values()].map(x => ({ test: x.code || x.name, value: +x.value, unit: x.unit, ref_low: x.ref_low, ref_high: x.ref_high, day: x.day, flag: labFlag(x) })),
    conditions: profile.conditions || "", meds: profile.meds || "", allergies: profile.allergies || "", goals: profile.goals || "",
    advice: [...(data.visits || [])].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 3).map(v => ({ day: v.day, kind: v.kind, diagnosis: v.diagnosis || "", advice: v.advice || "" }))
  };
}
const AI_PLAN_SYSTEM = (lang, ids) => `You are a careful family health coach (not a doctor). Given a de-identified health summary, suggest an eating template and a workout template from the allowed ids, with short reasons tied to the data.
Reply ONLY with JSON: {"summary":"2-3 sentences","diet":"one of: ${ids.diets.join("|")}","workout":"one of: ${ids.workouts.join("|")}","tips":["up to 5 short, concrete daily tips"],"cautions":["things to ask the doctor about, if any"]}.
Follow the doctor's advice in the data when it exists. Do not diagnose, do not suggest medication changes. For children never mention calories or weight loss. Write in ${lang === "en" ? "English" : "Simplified Chinese"}.`;
function parsePlanAI(text, ids){
  let o; try { o = JSON.parse(String(text).replace(/^```(json)?|```$/g, "").trim()); } catch (e) { return null; }
  if (!o || typeof o !== "object") return null;
  const list = v => (Array.isArray(v) ? v.map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 6) : []);
  return { summary: String(o.summary || "").slice(0, 800), diet: ids.diets.includes(o.diet) ? o.diet : null, workout: ids.workouts.includes(o.workout) ? o.workout : null, tips: list(o.tips), cautions: list(o.cautions) };
}

/** 一周采购清单：饮食模版的 shop（按语言） → 爱家小助手的网址（另一个 Supabase 项目，只能带参数跳过去，爱家那边确认后加进采购清单） */
const PANTRY_URL = "https://dev-hyang.github.io/home-pantry/";
function pantryLink(items, from){
  const q = new URLSearchParams({ add: items.map(s => String(s).replace(/\|/g, " ").slice(0, 60)).filter(Boolean).slice(0, 40).join("|"), from: String(from || "").slice(0, 60) });
  return `${PANTRY_URL}#/shopping?${q.toString()}`;
}

export { KEYWORDS, healthTags, recommend, weekStats, workoutOn, tplOf, aiSummary, AI_PLAN_SYSTEM, parsePlanAI, pantryLink, bmiOf };
