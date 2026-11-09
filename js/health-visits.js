import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { debounce, esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { LABS, PLACES, VISIT_KINDS } from "./data/health-ref.js";
import { ageYears, labFlag, labName, rangeText } from "./health-lib.js";
import { UI, fmtDay, lang, openVisit, profileData, visitCard, vitalsText } from "./health.js";
import * as hl from "./hl.js";
import * as pg from "./pager.js";
import { fbar, secHead } from "./ui.js";
import { render, renderBg } from "./views.js";

/* ============ 健康 · 就诊（2026-11-03） ============
   列表两种视图：行（紧凑，一次就诊一行）和时间线（按年月分组，竖线串起来）。
   筛选和排序收在「筛选」按钮里（ui.js 的 fbar：按钮 + 搜索框 + 新增，点开才出现各组选项，已选的在下面显示成可点掉的小标签）：
     类型、地点、年份、只看有复诊的；排序：新 → 旧 / 旧 → 新 / 按类型；视图：行 / 时间线；每页：10 / 15 / 20 / 50（全应用一个设置，存本机；没设过手机 10、电脑 20）。
   「继续加载」：先画一页，点一次多一页（pager.js，和任务、代祷同一套）。
   详情页：地点、医生、原因、体征、诊断、医生建议、复诊、这次的化验；「AI 解读」把这次就诊（去掉姓名）发给用户自己的 AI，
   用大白话解释、列出和医生意见一致的地方、AI 看法不同或补充的地方（只当作复诊时可以问的问题）；结果存在 hl_visits.ai（迁移 028）。
   「去爱家记医疗账单」：爱家小助手是另一个 Supabase 项目，只能打开爱家的一次性账单表单、把机构 / 日期 / 就诊人带在网址里预填，不建关联。 */
const VF = () => (UI().vf ||= { q: "", kind: "all", place: "all", year: "all", fu: false, sort: "new", mode: "rows" });
const PANTRY = "https://dev-hyang.github.io/home-pantry/";

function filtered(key){
  const f = VF(), q = f.q.trim().toLowerCase();
  let list = S.hl.visits.filter(v => v.subject === key);
  if (f.kind !== "all") list = list.filter(v => v.kind === f.kind);
  if (f.place !== "all") list = list.filter(v => (v.place || "") === f.place);
  if (f.year !== "all") list = list.filter(v => v.day.startsWith(f.year));
  if (f.fu) list = list.filter(v => v.follow_up);
  if (q) list = list.filter(v => [v.provider, v.location, v.reason, v.diagnosis, v.advice, v.notes, t((VISIT_KINDS[v.kind] || {}).label || "")].join(" ").toLowerCase().includes(q));
  const by = { new: (a, b) => b.day.localeCompare(a.day), old: (a, b) => a.day.localeCompare(b.day), kind: (a, b) => String(a.kind).localeCompare(String(b.kind)) || b.day.localeCompare(a.day) }[f.sort] || ((a, b) => b.day.localeCompare(a.day));
  return list.sort(by);
}
const placeText = v => [v.place && PLACES[v.place] ? `${PLACES[v.place].icon} ${t(PLACES[v.place].label)}` : "", v.location].filter(Boolean).join(" · ");

/* ---- 列表 ---- */
function visitsListHTML(who){
  const f = VF(), all = S.hl.visits.filter(v => v.subject === who.key), list = filtered(who.key);
  if (!all.length) return `<div class="panel empty">${t("还没有就诊记录。")}<br><button class="btn primary" data-hl="new-visit">${t("记一次就诊")}</button></div>`;
  const opt = (k, v, label, count) => ({ label: esc(label), attrs: `data-hl="vf" data-k="${k}" data-v="${esc(v)}"`, on: String(f[k]) === String(v), count });
  const kinds = [...new Set(all.map(v => v.kind))], places = [...new Set(all.map(v => v.place || "").filter(Boolean))], years = [...new Set(all.map(v => v.day.slice(0, 4)))].sort().reverse();
  // 筛选面板里只放真正的筛选（类型 / 地点 / 年份 / 复诊：选了以后在下面显示成可点掉的小标签）；排序、每页条数放在面板底部；行 / 时间线放在外面，一眼能切
  const groups = [
    { label: "类型", opts: [opt("kind", "all", t("全部")), ...kinds.map(k => opt("kind", k, `${(VISIT_KINDS[k] || VISIT_KINDS.other).icon} ${t((VISIT_KINDS[k] || VISIT_KINDS.other).label)}`, all.filter(v => v.kind === k).length))] },
    ...(places.length ? [{ label: "地点", opts: [opt("place", "all", t("全部")), ...places.map(p => opt("place", p, `${(PLACES[p] || PLACES.other).icon} ${t((PLACES[p] || PLACES.other).label)}`, all.filter(v => v.place === p).length))] }] : []),
    ...(years.length > 1 ? [{ label: "年份", opts: [opt("year", "all", t("全部")), ...years.map(y => opt("year", y, y, all.filter(v => v.day.startsWith(y)).length))] }] : []),
    { label: "复诊", opts: [opt("fu", "false", t("不限")), opt("fu", "true", t("只看有复诊日期的"))] }
  ];
  const chipRow = (label, items) => `<div class="fgroup hl-fextra"><div class="flab">${t(label)}</div><div class="chips" style="margin:0">${items.join("")}</div></div>`;
  const extra = chipRow("排序", [["new", "新 → 旧"], ["old", "旧 → 新"], ["kind", "按类型"]].map(([v, l]) => `<button class="chip" data-hl="vf" data-k="sort" data-v="${v}" aria-pressed="${f.sort === v}">${t(l)}</button>`))
    + chipRow("每页", pg.SIZES.filter(n => n >= 10).map(n => `<button class="chip" data-hl="vf-size" data-v="${n}" aria-pressed="${pg.pageSize() === n}">${n}</button>`));
  const bar = fbar({ id: "hlVisits", groups, q: { id: "hlVq", value: f.q, ph: "搜索：医生、地点、原因、诊断、建议" }, add: { attrs: 'data-hl="new-visit"', label: "就诊" }, extra });
  const shown = pg.page("hlVisits", list);
  const body = !list.length ? `<div class="panel empty">${t("没有符合筛选的就诊。")}</div>` : f.mode === "timeline" ? timelineHTML(shown) : rowsHTML(shown);
  const modes = `<div class="seg mini" role="group" aria-label="${esc(t("显示方式"))}"><button data-hl="vf" data-k="mode" data-v="rows" aria-pressed="${f.mode !== "timeline"}">☰ ${t("行")}</button><button data-hl="vf" data-k="mode" data-v="timeline" aria-pressed="${f.mode === "timeline"}">⋮ ${t("时间线")}</button></div>`;
  return `${bar}<div class="hl-listbar"><p class="small muted hl-count">${t("{a} / {b} 次就诊", { a: list.length, b: all.length })}${f.sort !== "new" ? ` · ${t({ old: "旧 → 新", kind: "按类型" }[f.sort])}` : ""}</p>${modes}</div>${body}${pg.moreBtn("hlVisits", list.length)}`;
}
function rowsHTML(list){
  return `<div class="panel mlist hl-vrows">${list.map(v => { const k = VISIT_KINDS[v.kind] || VISIT_KINDS.other, labs = S.hl.labs.filter(x => x.visit_id === v.id), bad = labs.filter(labFlag).length;
    return `<button class="mrow" data-hl="open-visit" data-id="${esc(v.id)}"><span class="mi" aria-hidden="true">${k.icon}</span>
      <span class="mt"><b>${esc(fmtDay(v.day))} · ${esc(t(k.label))}${v.follow_up && v.follow_up >= S.day ? ` <span class="pill soon">${t("复诊 {d}", { d: fmtDay(v.follow_up) })}</span>` : ""}${v.ai ? ` <span class="pill cat">AI</span>` : ""}</b>
        <small>${esc([placeText(v), v.provider].filter(Boolean).join(" · ") || t("没填地点"))}</small>
        ${v.reason || v.diagnosis ? `<small>${esc([v.reason, v.diagnosis].filter(Boolean).join(" · ").slice(0, 120))}</small>` : ""}
        ${labs.length ? `<small>${t("化验 {n} 项", { n: labs.length })}${bad ? ` · <span class="hl-bad">${t("{n} 项超出范围", { n: bad })}</span>` : ""}</small>` : ""}</span><span class="mch" aria-hidden="true">›</span></button>`; }).join("")}</div>`;
}
function timelineHTML(list){
  let lastYm = "";
  return `<ol class="hl-tl">${list.map(v => { const k = VISIT_KINDS[v.kind] || VISIT_KINDS.other, ym = v.day.slice(0, 7), head = ym !== lastYm ? `<li class="hl-tl-month">${esc(ym.replace("-", " / "))}</li>` : ""; lastYm = ym;
    return `${head}<li class="hl-tl-item"><span class="hl-tl-dot" aria-hidden="true">${k.icon}</span><button class="hl-tl-card" data-hl="open-visit" data-id="${esc(v.id)}">
      <span class="hl-tl-top"><b>${esc(t(k.label))}</b><span class="num muted">${esc(fmtDay(v.day))}</span>${v.follow_up && v.follow_up >= S.day ? `<span class="pill soon">${t("复诊 {d}", { d: fmtDay(v.follow_up) })}</span>` : ""}</span>
      ${placeText(v) || v.provider ? `<span class="small muted">${esc([placeText(v), v.provider].filter(Boolean).join(" · "))}</span>` : ""}
      ${v.reason ? `<span>${esc(v.reason)}</span>` : ""}
      ${v.advice ? `<span class="hl-tl-adv">${esc(v.advice.slice(0, 140))}${v.advice.length > 140 ? "…" : ""}</span>` : ""}</button></li>`; }).join("")}</ol>`;
}

/* ---- 详情页 ---- */
function visitDetailHTML(who){
  const v = S.hl.visits.find(x => x.id === UI().visitId);
  if (!v) { UI().view = "visits"; return visitsListHTML(who); }
  const k = VISIT_KINDS[v.kind] || VISIT_KINDS.other, data = hl.dataOf(v.subject), labs = data.labs.filter(x => x.visit_id === v.id);
  const row = (label, val) => (val ? `<div class="hl-prof-row"><span class="muted">${t(label)}</span><span>${val}</span></div>` : "");
  const bill = new URLSearchParams({ bill: "new", kind: "medical", provider: [v.location, v.provider].filter(Boolean).join(" · ").slice(0, 60), date: v.day, patient: (hl.person(v.subject) || {}).name || "" });
  return `<div class="hl-detail-nav"><button class="chip" data-hl="back">‹ ${t("返回")}</button></div>
    <div class="panel hl-vd">
      <div class="hl-vd-head"><h2>${k.icon} ${esc(t(k.label))}</h2><span class="num muted">${esc(fmtDay(v.day))}</span>${v.ai_used ? `<span class="pill cat">${t("AI 读图")}</span>` : ""}</div>
      ${row("地点", esc(placeText(v)))}${row("医生 / 科室", esc(v.provider))}${row("就诊原因", esc(v.reason))}${row("体征", esc(vitalsText(v.vitals || {})))}
      ${row("诊断", esc(v.diagnosis))}${v.advice ? `<div class="hl-advice" style="margin-top:8px"><span class="muted">${t("医生建议")}：</span>${esc(v.advice)}</div>` : ""}
      ${row("复诊", v.follow_up ? esc(fmtDay(v.follow_up)) : "")}${row("备注", esc(v.notes))}
      <div class="btns"><button class="btn" data-hl="edit-visit" data-id="${esc(v.id)}">${t("编辑")}</button>
        <a class="btn" href="${esc(PANTRY + "#/bills/onetime?" + bill.toString())}" target="_blank" rel="noopener">🧾 ${t("去爱家记医疗账单")} ↗</a></div>
      <p class="small muted" style="margin:6px 0 0">${t("爱家小助手是另一个数据库：这里只是打开爱家的一次性账单表单，把地点、日期、就诊人带过去预填，两边不互相关联。")}</p></div>
    ${labs.length ? `${secHead(t("这次的化验"), "", t("{n} 项", { n: labs.length }))}<div class="panel hl-labs-ov">${labs.map(x => { const f = labFlag(x); return `<button class="hl-vd-lab ${f ? "flag-" + f : ""}" data-hl="lab-open" data-v="${esc(x.code || x.name)}"><span>${esc(labName(x, lang()))}</span><b class="num">${esc(+(+x.value).toFixed(2))}</b><small class="muted">${esc(x.unit || "")} · ${t("参考 {r}", { r: rangeText(x) || "—" })}</small>${f ? `<span class="pill ${f === "high" ? "hi" : "lo"}">${t(f === "high" ? "偏高" : "偏低")}</span>` : ""}</button>`; }).join("")}</div>` : ""}
    ${aiVisitHTML(v)}`;
}
function aiVisitHTML(v){
  const a = v.ai, busy = S.hlAiBusy === "visit:" + v.id;
  const list = (title, arr) => (arr && arr.length ? `<b>${t(title)}</b><ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  return `${secHead(t("AI 解读"), "", t("和医生的意见对照"))}<div class="panel hl-ai-res">
    ${a ? `<p class="small muted">${t("{d} 分析", { d: fmtDay(String(a.at).slice(0, 10)) })}</p>${a.plain ? `<p>${esc(a.plain)}</p>` : ""}${list("和医生意见一致的", a.agree)}${list("AI 的补充或不同看法（复诊时可以问医生）", a.differ)}${list("可以问医生的问题", a.questions)}` : ""}
    <div class="btns" style="margin-top:${a ? 6 : 0}px"><button class="btn ${a ? "" : "primary"}" data-hl="ai-visit" data-id="${esc(v.id)}" ${busy ? "disabled" : ""}>${busy ? t("分析中…") : a ? t("重新分析") : t("让 AI 解读这次就诊")}</button></div>
    <p class="small muted" style="margin:6px 0 0">${aiReady() ? t("发给你自己设置的 AI：年龄、性别、这次的体征、诊断、医生建议、化验和档案里的病史 / 用药；不发姓名。AI 不是医生：意见不同时以医生为准，把它当成复诊时要问的问题。") : t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")}</p></div>`;
}

/* ---- AI 解读一次就诊 ---- */
const AI_OK = LS_PREFIX + ".hlAiOk";
const VISIT_AI_SYSTEM = l => `You explain a family member's medical visit in plain language and compare it with the doctor's own assessment. You are not a doctor.
Input is de-identified JSON (age, sex, visit kind, reason, vitals, diagnosis, the doctor's advice, lab results with the lab's reference ranges and flags, history, medications).
Reply ONLY with JSON: {"plain":"3-5 sentence plain-language explanation of what this visit found","agree":["points where the data supports the doctor's assessment/advice"],"differ":["anything the data suggests that the doctor did not mention, or where general guidelines differ - phrased as something to ask the doctor"],"questions":["up to 4 concrete questions for the next visit"]}.
Never contradict the doctor as an instruction, never suggest stopping or changing medication, never diagnose. Use the lab's own ranges. Write in ${l === "en" ? "English" : "Simplified Chinese"}.`;
async function aiVisit(id){
  const v = S.hl.visits.find(x => x.id === id); if (!v) return;
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return; }
  if (!loadJSON(AI_OK, false)) { if (!confirm(t("会把这次就诊的体征、诊断、医生建议、化验和档案里的病史 / 用药发给你自己设置的 AI 服务商（不发姓名）。继续吗？"))) return; saveJSON(AI_OK, true); }
  const prof = profileData(v.subject), labs = S.hl.labs.filter(x => x.visit_id === v.id || (x.subject === v.subject && x.day === v.day));
  const input = { age: ageYears(prof.birth || (hl.person(v.subject) || {}).birth, S.day), sex: prof.sex || null, kind: v.kind, reason: v.reason, vitals: v.vitals, diagnosis: v.diagnosis, doctor_advice: v.advice,
    labs: labs.map(x => ({ test: x.code && LABS[x.code] ? LABS[x.code].en : x.name, value: +x.value, unit: x.unit, ref_low: x.ref_low, ref_high: x.ref_high, flag: labFlag(x) })), history: prof.conditions || "", medications: prof.meds || "" };
  S.hlAiBusy = "visit:" + id; render();
  try {
    const raw = await askText(VISIT_AI_SYSTEM(lang()), JSON.stringify(input), { json: true, maxTokens: 1800 });
    let o; try { o = JSON.parse(String(raw).replace(/^```(json)?|```$/g, "").trim()); } catch (e) { throw new Error(t("AI 返回的格式不对，再试一次")); }
    const arr = x => (Array.isArray(x) ? x.map(s => String(s).slice(0, 300)).filter(Boolean).slice(0, 6) : []);
    const ai = { at: new Date().toISOString(), plain: String(o.plain || "").slice(0, 1500), agree: arr(o.agree), differ: arr(o.differ), questions: arr(o.questions) };
    const saved = await hl.save("visits", { ...v, ai });
    if (!saved.ai) S.hl.visits = S.hl.visits.map(x => (x.id === id ? { ...x, ai } : x));   // 028 没执行：这次先显示，刷新后不在
    toast(t("分析好了"));
  } catch (e) { toast(t("分析失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { S.hlAiBusy = null; renderBg(); }
}

/* ---- 事件 ---- */
async function visitAct(act, d){
  const f = VF();
  switch (act) {
    case "vf": f[d.k] = d.k === "fu" ? d.v === "true" : d.v; pg.reset("hlVisits"); render(); return true;
    case "vf-size": pg.setPageSize(+d.v); render(); return true;
    case "ai-visit": await aiVisit(d.id); return true;
  }
  return false;
}
// 搜索：停手 200ms 再重画，光标放回去
const redraw = debounce(() => { render(); const i = document.getElementById("hlVq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
document.addEventListener("input", ev => { if (ev.target && ev.target.id === "hlVq") { VF().q = ev.target.value; pg.reset("hlVisits"); redraw(); } });

export { visitsListHTML, visitDetailHTML, visitAct };
