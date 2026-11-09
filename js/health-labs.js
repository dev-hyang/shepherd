import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { LABS, LAB_GROUPS } from "./data/health-ref.js";
import { ageYears, labFlag, labGroupOf, labName, rangeBar, rangeText } from "./health-lib.js";
import { UI, chartPanel, fmtDay, lang, latestLabs, openLab, profileData } from "./health.js";
import * as hl from "./hl.js";
import * as pg from "./pager.js";
import { secHead } from "./ui.js";
import { render, renderBg } from "./views.js";

/* ============ 健康 · 化验单项页 + 套餐 AI（2026-11-03） ============
   以前点一个化验项目，是在概览底部弹出它的走势；现在是单独的一页：
     开头：最新值、参考范围、偏高 / 偏低；2 次及以上画走势（图里画出参考范围，按每次化验单自己的范围），只有 1 次时说清楚；
     AI 解读这一项：这个数值是什么意思、走势（升 / 降 / 稳）、生活上能做什么、复诊时问什么（用户自己的 key，去掉姓名；结果存在档案 data.ai_labs）；
     每次的记录：行 / 时间线两种视图，点一条改或删（openLab），继续加载。
   化验页每个套餐（血脂、血常规…）一个「AI 解读这一套」：把这一套各项的最新值和上一次一起发过去，结果存在档案 data.ai_panels。 */
const AI_OK = LS_PREFIX + ".hlAiOk";
const keyOf = x => x.code || x.name;
const nameOfKey = k => (LABS[k] ? (lang() === "en" ? LABS[k].en : LABS[k].name) : k);

function labItemHTML(who){
  const ui = UI(), k = ui.labKey, rows = S.hl.labs.filter(x => x.subject === who.key && keyOf(x) === k).sort((a, b) => b.day.localeCompare(a.day));
  if (!rows.length) { ui.view = "labs"; return ""; }
  const last = rows[0], f = labFlag(last), bar = rangeBar(last), data = hl.dataOf(who.key), mode = ui.labMode || "rows";
  const head = `<div class="hl-detail-nav"><button class="chip" data-hl="back">‹ ${t("返回")}</button><span class="small muted">${esc(t(LAB_GROUPS[labGroupOf(last)] || ""))}</span></div>
    <div class="panel hl-li-head ${f ? "flag-" + f : ""}"><h2>${esc(nameOfKey(k))}</h2>
      <div class="hl-li-now"><b class="num">${esc(+(+last.value).toFixed(2))}</b><span class="muted">${esc(last.unit || "")}</span>${f ? `<span class="pill ${f === "high" ? "hi" : "lo"}">${t(f === "high" ? "偏高" : "偏低")}</span>` : `<span class="pill ok">${t("在范围内")}</span>`}</div>
      <p class="small muted" style="margin:2px 0 6px">${t("参考 {r}", { r: rangeText(last) || "—" })} · ${t("最近 {d}", { d: fmtDay(last.day) })} · ${t("{n} 次", { n: rows.length })}</p>
      ${bar ? `<span class="hl-rbar big" aria-hidden="true"><i class="ok" style="left:${bar.lo.toFixed(1)}%;width:${(bar.hi - bar.lo).toFixed(1)}%"></i><i class="at" style="left:${bar.at.toFixed(1)}%"></i></span>` : ""}</div>`;
  const chart = chartPanel("lab:" + k, data, { heightCm: null, kid: who.kid });
  const view = `<div class="seg mini" role="group" aria-label="${esc(t("显示方式"))}"><button data-hl="lab-mode" data-v="rows" aria-pressed="${mode === "rows"}">${t("行")}</button><button data-hl="lab-mode" data-v="timeline" aria-pressed="${mode === "timeline"}">${t("时间线")}</button></div>`;
  const shown = pg.page("hlLabRec", rows);
  const rec = (x, i) => { const g = labFlag(x), prev = rows[rows.indexOf(x) + 1], d = prev ? +(+x.value - +prev.value).toFixed(2) : null, visit = x.visit_id ? S.hl.visits.find(v => v.id === x.visit_id) : null;
    return { g, d, visit, main: `<b class="num">${esc(+(+x.value).toFixed(2))}</b> <small class="muted">${esc(x.unit || "")}</small>${g ? ` <span class="pill ${g === "high" ? "hi" : "lo"}">${t(g === "high" ? "偏高" : "偏低")}</span>` : ""}${d ? ` <small class="muted">${d > 0 ? "↑" : "↓"} ${Math.abs(d)}</small>` : ""}`,
      sub: [t("参考 {r}", { r: rangeText(x) || "—" }), visit ? `🩺 ${fmtDay(visit.day)}` : "", x.notes, x.ai_used ? "AI" : ""].filter(Boolean).map(esc).join(" · ") }; };
  const list = mode === "timeline"
    ? `<ol class="hl-tl">${shown.map(x => { const r = rec(x); return `<li class="hl-tl-item"><span class="hl-tl-dot ${r.g ? "flag-" + r.g : ""}" aria-hidden="true">🧪</span><button class="hl-tl-card" data-hl="edit-lab" data-id="${esc(x.id)}"><span class="hl-tl-top"><span class="num muted">${esc(fmtDay(x.day))}</span></span><span>${r.main}</span><span class="small muted">${r.sub}</span></button></li>`; }).join("")}</ol>`
    : `<div class="panel mlist">${shown.map(x => { const r = rec(x); return `<button class="mrow" data-hl="edit-lab" data-id="${esc(x.id)}"><span class="mi" aria-hidden="true">${r.g ? "!" : "✓"}</span><span class="mt"><b>${esc(fmtDay(x.day))} · ${r.main}</b><small>${r.sub}</small></span><span class="mch" aria-hidden="true">›</span></button>`; }).join("")}</div>`;
  return `${head}${chart}${aiItemHTML(who, k)}${secHead(t("每次的记录"), view, t("点一条改或删"))}${list}${pg.moreBtn("hlLabRec", rows.length)}`;
}

/* ---- AI：单项 ---- */
const ITEM_SYSTEM = l => `You explain one lab test's results over time for a family member, in plain language. You are not a doctor.
Input: de-identified JSON with the test name, every result (date, value, unit, the lab's own reference range, flag), age, sex, history, medications.
Reply ONLY with JSON: {"meaning":"what this test measures and what the latest value means against the lab's range (2-3 sentences)","trend":"rising|falling|stable|single","trend_text":"one sentence about the change over time","tips":["up to 4 everyday things that commonly help, if relevant"],"ask":["up to 3 questions for the doctor"]}.
Use the lab's own ranges, never diagnose, never suggest medication changes. Write in ${l === "en" ? "English" : "Simplified Chinese"}.`;
const PANEL_SYSTEM = l => `You explain a whole lab panel (e.g. lipid panel, comprehensive metabolic panel, complete blood count) for a family member, in plain language. You are not a doctor.
Input: de-identified JSON with each test's latest and previous result, unit, the lab's own reference range and flag, plus age, sex, history and medications.
Reply ONLY with JSON: {"summary":"3-4 sentences on the panel as a whole","findings":["one line per notable test or pattern, in range or not"],"tips":["up to 4 everyday things that commonly help"],"ask":["up to 4 questions for the doctor"]}.
Use the lab's own ranges, never diagnose, never suggest medication changes. Write in ${l === "en" ? "English" : "Simplified Chinese"}.`;
const ctx = key => { const p = profileData(key); return { age: ageYears(p.birth || (hl.person(key) || {}).birth, S.day), sex: p.sex || null, history: p.conditions || "", medications: p.meds || "" }; };
const asRow = x => ({ date: x.day, value: +x.value, unit: x.unit, ref_low: x.ref_low, ref_high: x.ref_high, flag: labFlag(x) });
async function callAi(system, input, maxTokens = 1500){
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return null; }
  if (!loadJSON(AI_OK, false)) { if (!confirm(t("会把化验结果、年龄、性别和档案里的病史 / 用药发给你自己设置的 AI 服务商（不发姓名）。继续吗？"))) return null; saveJSON(AI_OK, true); }
  const raw = await askText(system, JSON.stringify(input), { json: true, maxTokens });
  try { return JSON.parse(String(raw).replace(/^```(json)?|```$/g, "").trim()); } catch (e) { throw new Error(t("AI 返回的格式不对，再试一次")); }
}
const arr = x => (Array.isArray(x) ? x.map(s => String(s).slice(0, 300)).filter(Boolean).slice(0, 6) : []);
async function saveAi(key, field, k, val){ const p = profileData(key); await hl.saveProfile(key, { ...p, [field]: { ...(p[field] || {}), [k]: val } }); }
async function aiItem(){
  const ui = UI(), key = ui.who, k = ui.labKey, rows = S.hl.labs.filter(x => x.subject === key && keyOf(x) === k).sort((a, b) => a.day.localeCompare(b.day));
  S.hlAiBusy = "item:" + k; render();
  try {
    const o = await callAi(ITEM_SYSTEM(lang()), { test: LABS[k] ? LABS[k].en : k, results: rows.map(asRow), ...ctx(key) }); if (!o) return;
    await saveAi(key, "ai_labs", k, { at: new Date().toISOString(), meaning: String(o.meaning || "").slice(0, 1200), trend: String(o.trend || ""), trend_text: String(o.trend_text || "").slice(0, 400), tips: arr(o.tips), ask: arr(o.ask), n: rows.length });
    toast(t("分析好了"));
  } catch (e) { toast(t("分析失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { S.hlAiBusy = null; renderBg(); }
}
async function aiPanel(g){
  const key = UI().who, rows = latestLabs(hl.dataOf(key)).filter(r => r.group === g);
  if (!rows.length) return;
  S.hlAiBusy = "panel:" + g; render();
  try {
    const o = await callAi(PANEL_SYSTEM(lang()), { panel: g, tests: rows.map(r => ({ test: r.x.code && LABS[r.x.code] ? LABS[r.x.code].en : r.k, latest: asRow(r.x), previous: r.prev ? asRow(r.prev) : null })), ...ctx(key) }, 2000); if (!o) return;
    await saveAi(key, "ai_panels", g, { at: new Date().toISOString(), summary: String(o.summary || "").slice(0, 1500), findings: arr(o.findings), tips: arr(o.tips), ask: arr(o.ask), day: rows.reduce((a, r) => (r.x.day > a ? r.x.day : a), "") });
    toast(t("分析好了"));
  } catch (e) { toast(t("分析失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { S.hlAiBusy = null; renderBg(); }
}
const list = (title, a) => (a && a.length ? `<b>${t(title)}</b><ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
const TREND = { rising: "↑ 上升", falling: "↓ 下降", stable: "→ 平稳", single: "只有一次" };
function aiItemHTML(who, k){
  const a = (profileData(who.key).ai_labs || {})[k], busy = S.hlAiBusy === "item:" + k, n = S.hl.labs.filter(x => x.subject === who.key && keyOf(x) === k).length;
  return `${secHead(t("AI 解读这一项"), "", t("数值的意思和走势"))}<div class="panel hl-ai-res">
    ${a ? `<p class="small muted">${t("{d} 分析", { d: fmtDay(String(a.at).slice(0, 10)) })}${a.n && a.n !== n ? ` · ${t("之后又记了 {n} 次，可以重新分析", { n: n - a.n })}` : ""}</p>${a.meaning ? `<p>${esc(a.meaning)}</p>` : ""}
      ${a.trend_text ? `<p><b>${esc(t(TREND[a.trend] || a.trend || ""))}</b> ${esc(a.trend_text)}</p>` : ""}${list("日常可以做的", a.tips)}${list("可以问医生的问题", a.ask)}` : ""}
    <div class="btns" style="margin-top:${a ? 6 : 0}px"><button class="btn ${a ? "" : "primary"}" data-hl="ai-item" ${busy ? "disabled" : ""}>${busy ? t("分析中…") : a ? t("重新分析") : t("让 AI 解读")}</button></div>
    <p class="small muted" style="margin:6px 0 0">${t("只是帮你读懂数字，不是诊断；以医生意见为准。")}</p></div>`;
}
/** 化验页每个套餐下面：已有的 AI 解读（折叠） */
function panelAiHTML(who, g){
  const a = (profileData(who.key).ai_panels || {})[g]; if (!a) return "";
  return `<details class="panel hl-ai-res hl-ai-panel" ${S.hlAiOpen === g ? "open" : ""}><summary>✦ ${t("AI 解读")} <small class="muted">${t("{d} 分析", { d: fmtDay(String(a.at).slice(0, 10)) })}</small></summary>
    ${a.summary ? `<p>${esc(a.summary)}</p>` : ""}${list("各项", a.findings)}${list("日常可以做的", a.tips)}${list("可以问医生的问题", a.ask)}<p class="small muted">${t("只是帮你读懂数字，不是诊断；以医生意见为准。")}</p></details>`;
}

async function labAct(act, d){
  switch (act) {
    case "lab-mode": UI().labMode = d.v; render(); return true;
    case "ai-item": await aiItem(); return true;
    case "ai-panel": S.hlAiOpen = d.v; await aiPanel(d.v); return true;
  }
  return false;
}

export { labItemHTML, panelAiHTML, labAct };
