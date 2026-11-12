import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { VISIT_KINDS } from "./data/health-ref.js";
import { tplOf } from "./health-plan-lib.js";
import { REVIEW_SYSTEM, hasInput, parseReview, recentEvent, reviewInput, stampOf } from "./health-review-lib.js";
import { UI, fmtDay, lang, profileData } from "./health.js";
import * as hl from "./hl.js";
import { secHead } from "./ui.js";
import { render, renderBg } from "./views.js";

/* ============ 健康 · 概览的「AI 健康分析」（2026-11-11） ============
   单项化验、一套化验、一次就诊各有自己的 AI 解读；这里是放在概览上的整体分析，三种范围（逻辑和提示词在 health-review-lib.js）：
     全盘（所有就诊 + 化验 + 体征 + 训练饮食）· 最近一次（最近的就诊 / 化验那一天）· 需要留意（超出 / 贴近范围、到期的复查）。
   结果是行动建议：做得好的、最该加强的 1–4 个方向、就医 / 饮食（多吃、少吃或先停一阵）/ 睡眠 / 运动、问医生的问题。
   用户自己的 key，去掉姓名；第一次问一下（和其它健康 AI 共用一个同意）。每种范围的结果存在档案 data.ai_review[mode]。 */
const AI_OK = LS_PREFIX + ".hlAiOk";
const MODES = [["whole", "全盘分析", "🧭"], ["recent", "最近一次", "🩺"], ["watch", "需要留意", "🔎"]];
const AREA = { medical: ["🩺", "就医"], diet: ["🥗", "饮食"], sleep: ["😴", "睡眠"], exercise: ["🏃", "运动"], weight: ["⚖", "体重"], stress: ["🧘", "压力"], other: ["✦", "其他"] };
const mode = () => { const ui = UI(); if (!MODES.some(([k]) => k === ui.rvMode)) ui.rvMode = "whole"; return ui.rvMode; };
const planNames = key => { const p = profileData(key).plan || {}, nm = (ref, kind) => { const x = tplOf(ref, kind, S.hl.templates); return x ? x.x.en || x.x.zh : null; };
  return p.diet || p.workout ? { diet: p.diet ? nm(p.diet.tpl, "diet") : null, workout: p.workout ? nm(p.workout.tpl, "workout") : null } : null; };
const inputFor = (m, who) => reviewInput(m, { data: hl.dataOf(who.key), profile: profileData(who.key), birth: (hl.person(who.key) || {}).birth, kid: who.kid, today: S.day, plan: planNames(who.key) });

/** 这一种范围会看哪些记录（一行说明） */
function scopeText(m, who){
  const data = hl.dataOf(who.key);
  if (m === "recent") {
    const e = recentEvent(data); if (!e.visit && !e.laterDay) return t("还没有就诊或化验。");
    const parts = [];
    if (e.visit) parts.push(`${fmtDay(e.visit.day)} ${t((VISIT_KINDS[e.visit.kind] || VISIT_KINDS.other).label)}${e.visitLabs.length ? ` + ${t("化验 {n} 项", { n: e.visitLabs.length })}` : ""}`);
    if (e.laterDay) parts.push(`${fmtDay(e.laterDay)} ${t("化验 {n} 项", { n: e.laterLabs.length })}`);
    return t("看：{x}，和上一次比。", { x: parts.join("；") });
  }
  if (m === "watch") return t("看：超出或贴近参考范围的化验、偏高 / 偏低的体征、到期的复诊和复查。");
  return t("看：{v} 次就诊、{l} 条化验、{m} 次测量，以及最近 4 周的训练和饮食。", { v: data.visits.length, l: data.labs.length, m: data.measures.length });
}

function reviewHTML(who){
  const data = hl.dataOf(who.key);
  if (!data.visits.length && !data.labs.length && !data.measures.length) return "";
  const m = mode(), a = (profileData(who.key).ai_review || {})[m], busy = S.hlAiBusy === "review:" + m, now = stampOf(data);
  const seg = `<div class="seg mini hl-rv-modes" role="group" aria-label="${esc(t("分析范围"))}">${MODES.map(([k, l, ic]) => `<button data-hl="rv-mode" data-v="${k}" aria-pressed="${m === k}"><span aria-hidden="true">${ic}</span> ${t(l)}</button>`).join("")}</div>`;
  const stale = a && ((m === "recent" && a.ref && a.ref !== recentEvent(data).day) || (a.n != null && now > a.n));
  const meta = a ? `<p class="small muted hl-rv-meta">${t("{d} 分析", { d: fmtDay(String(a.at).slice(0, 10)) })}${stale ? ` · <span class="hl-rv-stale">${m === "recent" && a.ref !== recentEvent(data).day ? t("之后有了新的就诊或化验，可以重新分析") : t("之后又记了 {n} 条，可以重新分析", { n: now - a.n })}</span>` : ""}</p>` : "";
  const btn = `<button class="btn ${a && !stale ? "" : "primary"}" data-hl="rv-run" ${busy || !aiReady() ? "disabled" : ""}>${busy ? t("分析中…") : a ? t("重新分析") : t("开始分析")}</button>`;
  return `${secHead(t("AI 健康分析"), "", t("给出就医、饮食、睡眠、运动的建议"))}<div class="panel hl-ai-res hl-rv">${seg}
    <p class="small muted hl-rv-scope">${esc(scopeText(m, who))}</p>
    ${a ? meta + resultHTML(a) : ""}
    <div class="btns hl-rv-btns">${btn}</div>
    <p class="small muted" style="margin:6px 0 0">${aiReady() ? t("发给你自己设置的 AI：年龄、性别、档案里的病史 / 用药 / 目标，以及上面说的记录；不发姓名。只是建议，不是诊断；以医生意见为准。") : t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")}</p></div>`;
}
const ul = (title, arr, cls = "") => (arr && arr.length ? `<div class="hl-rv-box ${cls}"><b>${title}</b><ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "");
function resultHTML(a){
  const focus = a.focus && a.focus.length ? `<ol class="hl-rv-focus">${a.focus.map(f => { const [ic, l] = AREA[f.area] || AREA.other;
    return `<li><span class="hl-rv-ic" aria-hidden="true">${ic}</span><div><span class="hl-rv-ft"><b>${esc(f.title || t(l))}</b><span class="pill cat">${t(l)}</span></span>${f.why ? `<small class="muted">${esc(f.why)}</small>` : ""}${f.action ? `<span class="hl-rv-do">→ ${esc(f.action)}</span>` : ""}</div></li>`; }).join("")}</ol>` : "";
  const grid = [ul(`🩺 ${t("就医")}`, a.medical), ul(`🥗 ${t("多吃 / 多做")}`, a.eat_more), ul(`🚫 ${t("少吃 / 先停一阵")}`, a.eat_less), ul(`😴 ${t("睡眠")}`, a.sleep), ul(`🏃 ${t("运动")}`, a.exercise), ul(`❓ ${t("可以问医生的问题")}`, a.ask)].filter(Boolean).join("");
  return `${a.summary ? `<p class="hl-rv-sum">${esc(a.summary)}</p>` : ""}${ul(`✓ ${t("做得好的")}`, a.good, "good")}
    ${focus ? `<b class="hl-rv-h">${t("最值得加强的")}</b>${focus}` : ""}${grid ? `<div class="hl-rv-grid">${grid}</div>` : ""}`;
}

async function runReview(who){
  const m = mode();
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return; }
  const input = inputFor(m, who);
  if (!hasInput(m, input)) { toast(t("这个范围还没有记录可以分析")); return; }
  if (!loadJSON(AI_OK, false)) { if (!confirm(t("会把年龄、性别、档案里的病史 / 用药 / 目标，以及就诊、化验、体征记录发给你自己设置的 AI 服务商（不发姓名）。继续吗？"))) return; saveJSON(AI_OK, true); }
  S.hlAiBusy = "review:" + m; render();
  try {
    const o = parseReview(await askText(REVIEW_SYSTEM(lang(), m, who.kid), JSON.stringify(input), { json: true, maxTokens: 3000 }));
    if (!o) throw new Error(t("AI 返回的格式不对，再试一次"));
    const data = hl.dataOf(who.key), p = profileData(who.key);
    await hl.saveProfile(who.key, { ...p, ai_review: { ...(p.ai_review || {}), [m]: { ...o, at: new Date().toISOString(), n: stampOf(data), ref: m === "recent" ? recentEvent(data).day : null } } });
    toast(t("分析好了"));
  } catch (e) { toast(t("分析失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { S.hlAiBusy = null; renderBg(); }
}

async function reviewAct(act, d){
  switch (act) {
    case "rv-mode": UI().rvMode = d.v; render(); return true;
    case "rv-run": { const who = hl.person(UI().who); if (who) await runReview(who); return true; }
  }
  return false;
}

export { reviewHTML, reviewAct };
