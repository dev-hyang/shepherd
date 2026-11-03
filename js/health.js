import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { LABS, LAB_GROUPS, MEASURE_KINDS, PLACES, VISIT_KINDS } from "./data/health-ref.js";
import { labCodeOf, labGroupOf, rangeBar, rangeText, vitalMetricsOf } from "./health-lib.js";
import { EXTRACT_SYSTEM, ageYears, bmiOf, daysBetween, dueItems, fromShow, labFlag, labName, latest, metricFlag, metricsOf, parseExtract, series, toShow, unitOf } from "./health-lib.js";
import * as hl from "./hl.js";
import { dietHTML, planAct, planHTML, todayPlanHTML, workoutHTML } from "./health-plan-ui.js";
import { visitAct, visitDetailHTML, visitsListHTML } from "./health-visits.js";
import { labAct, labItemHTML, panelAiHTML } from "./health-labs.js";
import * as pg from "./pager.js";
import { closeSheet, drawForm, getForm, openForm, readForm } from "./sheet.js";
import { pageHead, secHead } from "./ui.js";
import { render } from "./views.js";

/* ============ 健康页签（家人健康 · 阶段 1） ============
   一个人一个人地看：概览（待办、最近一次就诊、关键指标、走势图）· 就诊 · 化验 · 测量 · 档案。
   宽屏（≥ 900px）概览两栏：左边要做的事和医生说了什么，右边数字和图；手机一栏。
   数据库统一公制，显示按单位设置（English 默认美制，中文默认公制，档案页可改，存本机）。
   设计见 docs/design-health.md。 */
const UI = () => (S.hlUi ||= { who: null, view: "overview", metric: null });
const UNIT_KEY = LS_PREFIX + ".units";
const sys = () => loadJSON(UNIT_KEY, null) || (locale() === "en" ? "us" : "metric");
const lang = () => (locale() === "en" ? "en" : "zh");
const VIEWS = [["overview", "概览"], ["plan", "计划"], ["workout", "训练"], ["diet", "饮食"], ["visits", "就诊"], ["labs", "化验"], ["measures", "测量"], ["profile", "档案"]];
const fmtDay = d => (d ? d.replace(/-/g, "/") : "");
const parentView = v => ({ visit: "visits", lab: "labs" }[v] || v);

/* ---- 指标的显示：名称、量纲、参考带 ---- */
const MDIM = { weight: "weight", height: "length", waist: "length", temp: "temp", glucose: "glucose", bp: "mmhg", hr: "bpm", spo2: "pct", bmi: "bmi" };
const MNAME = { weight: "体重", height: "身高", waist: "腰围", temp: "体温", glucose: "血糖", bp: "血压", hr: "心率", spo2: "血氧", bmi: "BMI" };
const BAND = { bmi: [18.5, 25], bp: [90, 130], glucose: [70, 99], hr: [60, 100], spo2: [95, 100] };   // 成人参考带（公制 / 原单位），孩子不画
function metricMeta(m, data){
  if (m.startsWith("lab:")) {
    const k = m.slice(4), rows = data.labs.filter(x => (x.code || x.name) === k), last = rows[rows.length - 1] || {};
    return { name: labName({ code: LABS[k] ? k : "", name: k }, lang()), unit: last.unit || (LABS[k] || {}).unit || "", dim: null, band: [last.ref_low ?? null, last.ref_high ?? null] };
  }
  const dim = MDIM[m];
  return { name: t(MNAME[m] || m), unit: unitOf(dim, sys()), dim, band: BAND[m] || null };
}
const show = (meta, v) => (v == null ? "–" : meta.dim ? toShow(meta.dim, v, sys()) : +(+v).toFixed(2));
const showPoint = (m, meta, p) => (m === "bp" ? `${Math.round(p.v)}/${p.v2 != null ? Math.round(p.v2) : "–"}` : show(meta, p.v));

const profileData0 = key => (hl.profileOf(key) || {}).data || {};
/* ---- 页面 ---- */
function viewHealth(){
  if (S.hl.error === "missing") return `<div class="empty">${t("数据库还没有健康的表。")}<br>${t("请在 Supabase 执行 baby-log 仓库本地的")} <code>supabase/migrations/026_shepherd_health.sql</code>${t("，然后刷新。")}</div>`;
  if (S.hl.error) return `<div class="empty">${t("读取健康记录失败。")}<br>${t("请刷新重试。")}</div>`;
  if (!S.hl.loaded) return `<div class="empty">${t("正在读取…")}</div>`;
  const ui = UI(), ppl = hl.people();
  if (!ppl.some(p => p.key === ui.who)) ui.who = ppl[0] ? ppl[0].key : null;
  if (!ui.who) return `<div class="empty">${t("先登录。")}</div>`;
  const who = hl.person(ui.who);
  // 头部（2026-11-02 重新设计）：宽屏 = 新建按钮一排 + 家人芯片 + 内容芯片；手机 = 一行「家人下拉框 + ＋ 记一笔（展开小菜单）」+ 一个内容下拉框，
  // 八个芯片在手机上占三四行、要横着找；下拉框一眼看到当前是谁、哪一页。默认是当前登录的人（列表第一个）。不用浮动的 + 按钮：会挡住底部页签和列表最后一行
  const NEW = [["visit", "就诊", "🩺"], ["lab", "化验", "🧪"], ["measure", "测量", "⚖"], ...(S.hl.plansOk ? [["workout", "训练", "🏃"]] : [])];
  const newAct = k => (k === "workout" ? "wk-new" : "new-" + k);
  const add = `<span class="hl-add hl-d">${NEW.map(([k, l]) => `<button class="chip" data-hl="${newAct(k)}">＋ ${t(l)}</button>`).join("")}</span>`;
  const addMenu = `<details class="hl-addmenu"><summary class="btn hl-addbtn">＋ ${t("记一笔")}</summary><div class="hl-addmenu-list" role="menu">${NEW.map(([k, l, ic]) => `<button role="menuitem" data-hl="${newAct(k)}"><span aria-hidden="true">${ic}</span> ${t(l)}</button>`).join("")}</div></details>`;
  const chips = `<div class="chips hl-people hl-d" role="group" aria-label="${esc(t("看谁的"))}">${ppl.map(p => `<button class="chip" data-hl="who" data-key="${esc(p.key)}" aria-pressed="${p.key === ui.who}">${p.kid ? "🧒 " : ""}${esc(p.name)}${p.me ? ` <span class="cnt">${t("我")}</span>` : ""}</button>`).join("")}</div>`;
  const tabs = `<div class="chips hl-views hl-d" role="group" aria-label="${esc(t("健康内容"))}">${VIEWS.map(([k, l]) => `<button class="chip" data-hl="view" data-v="${k}" aria-pressed="${parentView(ui.view) === k}">${t(l)}</button>`).join("")}</div>`;
  const mobile = `<div class="hl-mhead hl-m"><div class="hl-mrow"><label class="sr-only" for="hlWho">${t("看谁的")}</label><select id="hlWho" class="hl-sel">${ppl.map(p => `<option value="${esc(p.key)}" ${p.key === ui.who ? "selected" : ""}>${p.kid ? "🧒 " : "👤 "}${esc(p.name)}${p.me ? ` (${t("我")})` : ""}</option>`).join("")}</select>${addMenu}</div>
    <label class="sr-only" for="hlView">${t("健康内容")}</label><select id="hlView" class="hl-sel hl-sel-view">${VIEWS.map(([k, l]) => `<option value="${k}" ${parentView(ui.view) === k ? "selected" : ""}>${t(l)}</option>`).join("")}</select></div>`;
  // 详情页（单次就诊、单个化验项目）不在下拉框里：选中的是它们的上一级
  const body = { overview: overviewHTML, plan: planHTML, workout: workoutHTML, diet: dietHTML, visits: visitsListHTML, visit: visitDetailHTML, labs: labsHTML, lab: labItemHTML, measures: measuresHTML, profile: profileHTML }[ui.view] || overviewHTML;
  return `${pageHead(t("家人健康"), add)}${mobile}${chips}${tabs}${body(who)}
    <p class="small muted hl-foot">${t("这里只做记录和按公开指南的提醒，不是诊断；有疑问以医生意见为准。家里的人都看得到这家人的健康记录。")}</p>`;
}

/* 概览：左栏（待办、最近一次就诊）+ 右栏（关键指标、走势图） */
function overviewHTML(who){
  const ui = UI(), data = hl.dataOf(who.key), prof = (hl.profileOf(who.key) || {}).data || {};
  const heightCm = prof.height_cm || null, kid = who.kid;
  const metrics = metricsOf(data, { kid, heightCm });
  // 走势图只给体征（卡片）；化验项目点开是单独的一页（health-labs.js）。以前点化验的血糖会被这里当成「不在列表里」换回体重
  const vitals0 = vitalMetricsOf(data, { kid, heightCm });
  if (!vitals0.includes(ui.metric)) ui.metric = vitals0[0] || null;
  const due = dueItems({ data, today: S.day, kid });
  const left = `${todayPlanHTML(who)}${secHead(t("待办"))}${dueHTML(due, kid)}${lastVisitHTML(data)}${kid ? `<p class="small muted" style="margin-top:10px">${t("孩子的身高体重和体检日程以小月亮为准，这里只读。")} <a href="https://dev-hyang.github.io/baby-log/" target="_blank" rel="noopener">${t("去小月亮")} ↗</a></p>` : ""}`;
  if (!metrics.length) return `<div class="hl-grid"><div class="hl-col">${left}</div><div class="hl-col">${secHead(t("关键指标"))}<div class="panel empty">${t("还没有数字。记一次就诊（带体征）、一份化验或一次在家测量，这里就会出现走势。")}<br>
    <button class="btn primary" data-hl="new-visit">${t("记一次就诊")}</button> <button class="btn" data-hl="new-measure">${t("记一次测量")}</button></div></div></div>`;
  const vitals = vitalMetricsOf(data, { kid, heightCm });
  const cards = vitals.map(m => {
    const meta = metricMeta(m, data), s = series(m, data, { heightCm }), l = latest(s), f = metricFlag(m, l, data, { kid });
    const delta = l && l.delta != null && m !== "bp" ? `<span class="d">${l.delta > 0 ? "↑" : l.delta < 0 ? "↓" : "→"} ${Math.abs(meta.dim ? toShow(meta.dim, Math.abs(l.delta), sys()) : l.delta)}</span>` : "";
    return `<button class="kpi hl-kpi ${ui.metric === m ? "sel" : ""}" data-hl="metric" data-v="${esc(m)}" aria-pressed="${ui.metric === m}">
      <span class="k">${esc(meta.name)}</span><b class="v num">${showPoint(m, meta, l)}<small> ${esc(meta.unit)}</small></b>
      <span class="hl-kpi-foot">${f ? `<span class="pill ${f.level === "high" ? "hi" : "lo"}">${esc(t(f.text))}</span>` : `<span class="small muted">${fmtDay(l.day)}</span>`}${delta}</span>
      ${spark(s)}</button>`;
  }).join("");
  // 右栏：体征卡片（体重 / BMI / 血压 / 心率…）→ 化验结果（按套餐，下拉框切换，范围条）→ 选中那一项的走势图
  const right = `${secHead(t("关键指标"))}${vitals.length ? `<div class="kpis hl-kpis">${cards}</div>` : `<div class="panel small muted">${t("还没有体征。")}</div>`}
    ${labOverviewHTML(data)}${ui.metric ? chartPanel(ui.metric, data, { heightCm, kid }) : ""}`;
  return `<div class="hl-grid"><div class="hl-col">${left}</div><div class="hl-col">${right}</div></div>`;
}
function dueHTML(due, kid){
  if (!due.length) return `<div class="panel small muted">${kid ? t("没有要复诊的。") : t("没有到期的复诊、体检或复查 ✓")}</div>`;
  const cls = { due: "hi", soon: "soon", info: "" };
  return `<div class="panel mlist hl-due">${due.map(x => {
    const vars = { ...(x.vars || {}) }; if (vars.name) vars.name = labName({ code: LABS[vars.name] ? vars.name : "", name: vars.name }, lang());
    const when = x.days == null ? "" : x.days < 0 ? t("逾期 {n} 天", { n: -x.days }) : x.days === 0 ? t("今天") : t("{n} 天后", { n: x.days });
    return `<div class="hl-due-row"><span class="pill ${cls[x.level]}">${esc(when || t("留意"))}</span><div class="mt"><b>${esc(t(x.title, vars))}</b>${x.detail ? `<small>${esc(t(x.detail, vars))}</small>` : x.day ? `<small>${fmtDay(x.day)}</small>` : ""}</div></div>`;
  }).join("")}</div>`;
}
function lastVisitHTML(data){
  const v = [...data.visits].sort((a, b) => b.day.localeCompare(a.day))[0];
  if (!v) return `${secHead(t("最近一次就诊"))}<div class="panel small muted">${t("还没有记录。")} <button class="chip" data-hl="new-visit">＋ ${t("记一次就诊")}</button></div>`;
  return `${secHead(t("最近一次就诊"), `<button class="chip" data-hl="view" data-v="visits">${t("全部")} ›</button>`)}${visitCard(v, data, { full: true })}`;
}
const vitalsText = vt => {
  const s = sys(), out = [];
  if (vt.sys) out.push(`${t("血压")} ${vt.sys}/${vt.dia ?? "–"}`);
  if (vt.hr) out.push(`${t("心率")} ${vt.hr}`);
  if (vt.weight_kg) out.push(`${t("体重")} ${toShow("weight", vt.weight_kg, s)} ${unitOf("weight", s)}`);
  if (vt.height_cm) out.push(`${t("身高")} ${toShow("length", vt.height_cm, s)} ${unitOf("length", s)}`);
  if (vt.temp_c) out.push(`${t("体温")} ${toShow("temp", vt.temp_c, s)}${unitOf("temp", s)}`);
  if (vt.spo2) out.push(`${t("血氧")} ${vt.spo2}%`);
  return out.join(" · ");
};
function visitCard(v, data, { full = false } = {}){
  const k = VISIT_KINDS[v.kind] || VISIT_KINDS.other, labs = data.labs.filter(x => x.visit_id === v.id), vt = vitalsText(v.vitals || {});
  const fu = v.follow_up ? `<span class="pill ${daysBetween(S.day, v.follow_up) <= 14 && v.follow_up >= S.day ? "soon" : "cat"}">${t("复诊 {d}", { d: fmtDay(v.follow_up) })}</span>` : "";
  return `<button class="panel hl-visit" data-hl="open-visit" data-id="${esc(v.id)}">
    <span class="hl-visit-top"><b>${k.icon} ${esc(t(k.label))}</b><span class="num">${fmtDay(v.day)}</span>${fu}${v.ai_used ? `<span class="pill cat">AI</span>` : ""}</span>
    ${v.provider || v.reason ? `<span class="hl-line">${esc([v.provider, v.reason].filter(Boolean).join(" · "))}</span>` : ""}
    ${vt ? `<span class="hl-line small muted">${esc(vt)}</span>` : ""}
    ${v.diagnosis ? `<span class="hl-line"><span class="muted">${t("诊断")}：</span>${esc(full ? v.diagnosis : v.diagnosis.slice(0, 80))}</span>` : ""}
    ${v.advice ? `<span class="hl-advice"><span class="muted">${t("医生建议")}：</span>${esc(full ? v.advice : v.advice.slice(0, 120) + (v.advice.length > 120 ? "…" : ""))}</span>` : ""}
    ${labs.length ? `<span class="hl-line small muted">${t("化验 {n} 项", { n: labs.length })}${labs.some(labFlag) ? ` · ${t("{n} 项超出范围", { n: labs.filter(labFlag).length })}` : ""}</span>` : ""}
  </button>`;
}

/* 走势图：两套画布（宽屏 640×240、手机 360×220），参考带、就诊日竖线、点上的数值；下面一张可展开的数据表 */
function chartPanel(m, data, { heightCm, kid }){
  const meta = metricMeta(m, data), s = series(m, data, { heightCm });
  if (!s.length) return "";
  const band = kid && !m.startsWith("lab:") ? null : meta.band;
  const visitDays = [...new Set(data.visits.map(v => v.day))];
  const svg = (W, H, cls) => {
    const P = { l: 44, r: 12, t: 16, b: 26 };
    const vals = s.flatMap(p => [p.v, p.v2].filter(v => v != null)).map(v => +show(meta, v));
    const bandS = band ? band.map(b => (b == null ? null : +show(meta, b))) : null;
    let lo = Math.min(...vals, ...(bandS || []).filter(x => x != null)), hi = Math.max(...vals, ...(bandS || []).filter(x => x != null));
    if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const t0 = new Date(s[0].day).getTime(), t1 = Math.max(t0 + 864e5, new Date(s[s.length - 1].day).getTime());
    const X = d => P.l + (new Date(d).getTime() - t0) / (t1 - t0) * (W - P.l - P.r), Y = v => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b);
    let g = "";
    if (bandS && (bandS[0] != null || bandS[1] != null)) { const y1 = Y(bandS[1] ?? hi), y2 = Y(bandS[0] ?? lo); g += `<rect x="${P.l}" y="${y1.toFixed(1)}" width="${W - P.l - P.r}" height="${Math.max(0, y2 - y1).toFixed(1)}" fill="var(--sage-soft)"/>`; }
    for (const d of visitDays) if (d >= s[0].day && d <= s[s.length - 1].day) g += `<line x1="${X(d).toFixed(1)}" x2="${X(d).toFixed(1)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--line)" stroke-dasharray="3 3"/>`;
    for (const v of [lo + pad, hi - pad]) g += `<text x="${P.l - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="hl-ax">${+v.toFixed(1)}</text>`;
    g += `<text x="${P.l}" y="${H - 6}" class="hl-ax">${fmtDay(s[0].day)}</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end" class="hl-ax">${fmtDay(s[s.length - 1].day)}</text>`;
    const line = (key, color) => { const pts = s.filter(p => p[key] != null).map(p => `${X(p.day).toFixed(1)},${Y(+show(meta, p[key])).toFixed(1)}`); return pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>` : ""; };
    g += line("v", "var(--slate)"); if (m === "bp") g += line("v2", "var(--sky)");
    const lastI = s.length - 1;
    s.forEach((p, i) => { for (const key of m === "bp" ? ["v", "v2"] : ["v"]) { if (p[key] == null) continue; const x = X(p.day), y = Y(+show(meta, p[key]));
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.src === "visit" ? 4.5 : 3.5}" fill="${p.src === "visit" ? "var(--surface)" : key === "v2" ? "var(--sky)" : "var(--slate)"}" stroke="${key === "v2" ? "var(--sky)" : "var(--slate)"}" stroke-width="2"/>`;
      if (i === lastI || s.length <= 8) g += `<text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="hl-val">${show(meta, p[key])}</text>`; } });
    return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t("{name}走势", { name: meta.name }))}">${g}</svg>`;
  };
  const src = { home: t("在家"), visit: t("就诊"), lab: t("化验"), growth: t("小月亮") };
  const table = `<details class="hl-table"><summary>${t("看数据（{n} 条）", { n: s.length })}</summary><div class="scroll-x"><table><thead><tr><th scope="col">${t("日期")}</th><th scope="col">${esc(meta.name)}${meta.unit ? ` (${esc(meta.unit)})` : ""}</th><th scope="col">${t("来源")}</th></tr></thead>
    <tbody>${[...s].reverse().map(p => `<tr><td>${fmtDay(p.day)}</td><td class="num">${showPoint(m, meta, p)}</td><td>${esc(src[p.src] || "")}</td></tr>`).join("")}</tbody></table></div></details>`;
  const legend = `<span class="small muted">${band && !kid ? `<span class="hl-sw band"></span>${t("参考范围")} · ` : ""}<span class="hl-sw dot"></span>${t("在家 / 化验")} · <span class="hl-sw ring"></span>${t("就诊")}${m === "bp" ? ` · <span class="hl-sw sky"></span>${t("舒张压")}` : ""}</span>`;
  // 只有一个点：画不出走势，直接说清楚（化验一般一年一次，下一次记了就有线）
  if (s.length < 2) return `<div class="panel hl-chart"><div class="hl-chart-head"><b>${esc(meta.name)}</b></div><p class="small muted" style="margin:0">${t("目前只有 {d} 这一次（{v}），再记一次就能看到走势。", { d: fmtDay(s[0].day), v: `${showPoint(m, meta, s[0])}${meta.unit ? " " + meta.unit : ""}` })}</p>${table}</div>`;
  return `<div class="panel hl-chart"><div class="hl-chart-head"><b>${esc(meta.name)}</b>${legend}</div>${svg(560, 230, "hl-w")}${svg(360, 220, "hl-n")}${table}</div>`;
}
/** 卡片里的小走势线 */
function spark(s){
  if (s.length < 2) return "";
  const W = 100, H = 24, vs = s.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const pts = s.slice(-12).map((p, i, a) => `${(i / Math.max(1, a.length - 1) * W).toFixed(1)},${(H - 2 - (p.v - lo) / sp * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="hl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

/* ---- 化验结果：每项最新一次，按套餐分组；一行 = 名称 · 数值 · 范围条（绿 = 正常段，点 = 这次的值）· 偏高 / 偏低 · 和上次比 ---- */
function latestLabs(data){
  const by = new Map();
  for (const x of [...data.labs].sort((a, b) => a.day.localeCompare(b.day))) { const k = x.code || x.name; by.set(k, { x, prev: by.get(k) ? by.get(k).x : null, n: (by.get(k) ? by.get(k).n : 0) + 1 }); }
  return [...by.entries()].map(([k, v]) => ({ k, ...v, group: labGroupOf(v.x), flag: labFlag(v.x) }));
}
const ORDER = Object.keys(LABS);
const byOrder = (a, b) => (ORDER.indexOf(a.x.code) + 1 || 999) - (ORDER.indexOf(b.x.code) + 1 || 999) || String(a.k).localeCompare(String(b.k));
function labLine(r, { metric = null, hist = false } = {}){
  const x = r.x, bar = rangeBar(x), m = "lab:" + r.k, d = r.prev ? +(+x.value - +r.prev.value).toFixed(2) : null;
  return `<div class="hl-lr ${r.flag ? "flag-" + r.flag : ""} ${metric === m ? "sel" : ""}">
    <button class="hl-lr-main" data-hl="lab-open" data-v="${esc(r.k)}" aria-label="${esc(t("看 {n} 的走势和每次记录", { n: labName(x, lang()) }))}">
      <span class="hl-lr-name"><b>${esc(labName(x, lang()))}</b><small>${t("参考 {r}", { r: rangeText(x) || "—" })}${x.unit ? ` ${esc(x.unit)}` : ""}</small></span>
      <span class="hl-lr-val"><b class="num">${esc(+(+x.value).toFixed(2))}</b>${r.flag ? `<span class="pill ${r.flag === "high" ? "hi" : "lo"}">${t(r.flag === "high" ? "偏高" : "偏低")}</span>` : ""}${d ? `<small class="muted">${d > 0 ? "↑" : "↓"} ${Math.abs(d)}</small>` : ""}</span>
      ${bar ? `<span class="hl-rbar" aria-hidden="true"><i class="ok" style="left:${bar.lo.toFixed(1)}%;width:${(bar.hi - bar.lo).toFixed(1)}%"></i><i class="at" style="left:${bar.at.toFixed(1)}%"></i></span>` : ""}
    </button>
    ${hist ? `<span class="hl-lab-hist">${S.hl.labs.filter(y => (y.code || y.name) === r.k && y.subject === x.subject).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 4).map(y => `<button class="hl-lab-v ${labFlag(y) ? "flag-" + labFlag(y) : ""}" data-hl="edit-lab" data-id="${esc(y.id)}" title="${esc(t("改这一条"))}"><b class="num">${esc(+(+y.value).toFixed(2))}</b><small>${fmtDay(y.day).slice(2)}</small></button>`).join("")}</span>` : ""}
  </div>`;
}
/** 概览里的化验：下拉框选套餐（默认「需要留意」：有偏高 / 偏低的；都正常时选最近一次化验的那一套） */
function labOverviewHTML(data){
  const ui = UI(), rows = latestLabs(data);
  if (!rows.length) return `${secHead(t("化验结果"), `<button class="chip" data-hl="new-lab">＋ ${t("录入化验")}</button>`)}<div class="panel small muted">${t("还没有化验。拍化验单 / 截图（可多张），或按套餐一次填一整份。")}</div>`;
  const groups = Object.keys(LAB_GROUPS).filter(g => rows.some(r => r.group === g)), flagged = rows.filter(r => r.flag);
  const newest = rows.reduce((a, r) => (r.x.day > a.x.day ? r : a), rows[0]);
  const opts = [...(flagged.length ? [["flag", t("需要留意（{n}）", { n: flagged.length })]] : []), ...groups.map(g => [g, `${t(LAB_GROUPS[g])}（${rows.filter(r => r.group === g).length}）`]), ["all", t("全部（{n}）", { n: rows.length })]];
  if (!opts.some(([v]) => v === ui.labGroup)) ui.labGroup = flagged.length ? "flag" : newest.group;
  const shown = (ui.labGroup === "flag" ? flagged : ui.labGroup === "all" ? rows : rows.filter(r => r.group === ui.labGroup)).sort(byOrder);
  const last = shown.reduce((a, r) => (r.x.day > a ? r.x.day : a), "");
  return `${secHead(t("化验结果"), `<button class="chip" data-hl="new-lab">＋ ${t("录入化验")}</button>`)}
    <div class="panel hl-labs-ov"><div class="hl-labs-bar"><label class="sr-only" for="hlLabGroup">${t("选套餐")}</label><select id="hlLabGroup">${opts.map(([v, l]) => `<option value="${v}" ${ui.labGroup === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <span class="small muted">${last ? t("最近 {d}", { d: fmtDay(last) }) : ""} · <button class="linkbtn" data-hl="view" data-v="labs">${t("全部化验")} ›</button></span></div>
      ${shown.map(r => labLine(r, { metric: ui.metric })).join("")}</div>`;
}

/* 就诊：时间倒序，分页 */
function visitsHTML(who){
  const data = hl.dataOf(who.key), list = [...data.visits].sort((a, b) => b.day.localeCompare(a.day));
  if (!list.length) return `<div class="panel empty">${t("还没有就诊记录。")}<br><button class="btn primary" data-hl="new-visit">${t("记一次就诊")}</button></div>`;
  return `<div class="hl-list">${pg.page("hlVisits", list).map(v => visitCard(v, data)).join("")}</div>${pg.moreBtn("hlVisits", list.length)}`;
}
/* 化验：按套餐分组（血脂 / 代谢综合 / 血常规…），每项最新值 + 范围条 + 最近 4 次（点一次改那一条） */
function labsHTML(who){
  const data = hl.dataOf(who.key), rows = latestLabs(data);
  if (!rows.length) return `<div class="panel empty">${t("还没有化验记录。")}<br><button class="btn primary" data-hl="new-lab">${t("录入化验")}</button></div>`;
  return `<div class="btns" style="margin-top:0"><button class="btn primary" data-hl="new-lab">＋ ${t("录入化验")}</button></div>` + Object.keys(LAB_GROUPS).filter(g => rows.some(r => r.group === g)).map(g => {
    const list = rows.filter(r => r.group === g).sort(byOrder), n = list.filter(r => r.flag).length;
    return `${secHead(t(LAB_GROUPS[g]), `<button class="chip" data-hl="ai-panel" data-v="${g}" ${S.hlAiBusy === "panel:" + g ? "disabled" : ""}>✦ ${S.hlAiBusy === "panel:" + g ? t("分析中…") : t("AI 解读这一套")}</button>`, n ? t("{n} 项超出范围", { n }) : t("都在范围内"))}
      ${panelAiHTML(who, g)}<div class="panel hl-labs-ov">${list.map(r => labLine(r, { hist: true })).join("")}</div>`;
  }).join("") + `<p class="small muted">${t("点名字看走势，点下面的数字改那一次。范围以化验单为准，各家化验室不完全一样。")}</p>`;
}
/* 测量：时间倒序 */
function measuresHTML(who){
  const data = hl.dataOf(who.key), list = [...data.measures].sort((a, b) => b.day.localeCompare(a.day) || String(b.created_at).localeCompare(String(a.created_at)));
  if (!list.length) return `<div class="panel empty">${t("还没有在家测量的记录。")}<br><button class="btn primary" data-hl="new-measure">${t("记一次测量")}</button></div>`;
  const s = sys();
  const val = m => { const k = MEASURE_KINDS[m.kind]; return m.kind === "bp" ? `${m.value}/${m.value2 ?? "–"} mmHg` : `${toShow(k.dim, m.value, s)} ${unitOf(k.dim, s)}`; };
  return `<div class="panel mlist">${pg.page("hlMeasures", list).map(m => `<button class="mrow" data-hl="edit-measure" data-id="${esc(m.id)}"><span class="mi" aria-hidden="true">${MEASURE_KINDS[m.kind].icon}</span>
    <span class="mt"><b>${esc(t(MEASURE_KINDS[m.kind].label))} · <span class="num">${esc(val(m))}</span></b><small>${fmtDay(m.day)}${m.notes ? ` · ${esc(m.notes)}` : ""}</small></span><span class="mch" aria-hidden="true">›</span></button>`).join("")}</div>${pg.moreBtn("hlMeasures", list.length)}`;
}
/* 档案 */
function profileHTML(who){
  const p = (hl.profileOf(who.key) || {}).data || {}, s = sys();
  const birth = who.kid ? who.birth : p.birth, age = ageYears(birth, S.day);
  const row = (k, v) => `<div class="hl-prof-row"><span class="muted">${t(k)}</span><span>${v ? esc(v) : `<span class="muted">—</span>`}</span></div>`;
  const sex = { f: "女", m: "男", o: "其他" }[p.sex];
  return `<div class="panel hl-prof">
    ${row("出生日期", birth ? `${fmtDay(birth)}${age != null ? `（${t("{n} 岁", { n: age })}）` : ""}` : "")}
    ${row("性别", sex ? t(sex) : "")}
    ${!who.kid ? row("身高", p.height_cm ? `${toShow("length", p.height_cm, s)} ${unitOf("length", s)}` : "") : ""}
    ${row("过敏", p.allergies)}${row("既往病史", p.conditions)}${row("长期用药", p.meds)}${row("目标", p.goals)}${row("备注", p.notes)}
    <div class="btns"><button class="btn primary" data-hl="edit-profile">${t("编辑档案")}</button></div></div>
    ${who.kid ? `<p class="small muted">${t("孩子的出生日期、身高体重在小月亮里改。")}</p>` : ""}
    ${secHead(t("单位"))}<div class="seg" role="group" aria-label="${esc(t("单位"))}"><button data-hl="units" data-v="metric" aria-pressed="${s === "metric"}">${t("公制（kg / cm / °C / mmol/L）")}</button><button data-hl="units" data-v="us" aria-pressed="${s === "us"}">${t("美制（lb / in / °F / mg/dL）")}</button></div>
    <p class="small muted" style="margin-top:6px">${t("只影响这台设备上的显示；数据库统一按公制存。")}</p>`;
}

/* ---- 表单 ---- */
const peopleOpts = () => hl.people().map(p => [p.key, p.name]);
/** 表单里的「谁」：和健康页头部同一个样式的下拉框（以前是一排按钮）；换人时重画（就诊列表、单位跟着这个人） */
const whoField = (label = "谁") => ({ k: "subject", type: "html", html: d => `<div class="field" style="margin:0"><label for="f_subject">${t(label)}</label><select id="f_subject" data-f="subject" class="hl-fsel">${hl.people().map(p => `<option value="${esc(p.key)}" ${p.key === d.subject ? "selected" : ""}>${p.kid ? "🧒 " : "👤 "}${esc(p.name)}${p.me ? ` (${t("我")})` : ""}</option>`).join("")}</select></div>` });
const selectField = (k, label, opts) => ({ k, type: "html", html: d => `<div class="field" style="margin:0"><label for="f_${k}">${t(label)}</label><select id="f_${k}" data-f="${k}" class="hl-fsel">${opts().map(([v, l]) => `<option value="${esc(v)}" ${String(d[k] ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` });
const fh = title => `<div class="fh">${t(title)}</div>`;
const today = () => S.day;
const aiBtn = (mode, d) => `<div class="hl-ai"><button type="button" class="btn" data-hl="ai-read" data-v="${mode}">📷 ${t(mode === "visit" ? "从就诊小结读取" : "从化验单读取")}</button>
  <span class="small muted">${d && d._aiBusy ? t("正在读取…") : d && d.ai_used ? t("已经用 AI 读过，保存前请核对。") : t("拍照或选图片，AI 读出来预填，你核对后再保存；照片不保存。")}</span></div>`;
const labsPreview = d => (d._labs && d._labs.length ? `<div class="panel hl-labs-pre"><b>${t("一起保存 {n} 项化验", { n: d._labs.length })}</b><ul>${d._labs.map(x => `<li>${esc(labName(x, lang()))}：<b class="num">${esc(x.value)}</b> ${esc(x.unit || "")}${labFlag(x) ? ` <span class="pill ${labFlag(x) === "high" ? "hi" : "lo"}">${t(labFlag(x) === "high" ? "偏高" : "偏低")}</span>` : ""}</li>`).join("")}</ul>
  <button type="button" class="chip" data-hl="ai-labs-clear">${t("不要这些化验")}</button></div>` : "");

function openVisit(v){
  const s = sys(), vt = (v && v.vitals) || {};
  const init = v ? { ...v, v_weight: toShow("weight", vt.weight_kg, s), v_height: toShow("length", vt.height_cm, s), v_sys: vt.sys ?? null, v_dia: vt.dia ?? null, v_hr: vt.hr ?? null, v_temp: toShow("temp", vt.temp_c, s), v_spo2: vt.spo2 ?? null }
    : { subject: UI().who, day: today(), kind: "regular" };
  openForm(v ? "编辑就诊" : "记一次就诊", [
    { k: "h_ai", type: "html", html: d => aiBtn("visit", d) },
    whoField(),
    { k: "day", label: "日期", type: "date" },
    selectField("kind", "类型", () => Object.entries(VISIT_KINDS).map(([k, x]) => [k, `${x.icon} ${t(x.label)}`])),
    selectField("place", "地点", () => [["", t("（不填）")], ...Object.entries(PLACES).map(([k, x]) => [k, `${x.icon} ${t(x.label)}`])]),
    { k: "location", label: "地点名称 / 地址", type: "text", ph: "例如 Duly Health · Naperville", list: [...new Set(S.hl.visits.map(x => x.location).filter(Boolean))].slice(0, 30) },
    { k: "provider", label: "医生 / 科室", type: "text", ph: "例如 Dr. Lee · 家庭医生" },
    { k: "reason", label: "就诊原因", type: "text", ph: "年度体检 / 咳嗽一周 / 复查血脂" },
    { k: "h_v", type: "html", html: () => fh("体征（可不填）") },
    { k: "v_weight", label: t("体重（{u}）", { u: unitOf("weight", s) }), type: "num", step: .1 },
    { k: "v_height", label: t("身高（{u}）", { u: unitOf("length", s) }), type: "num", step: .1 },
    { k: "v_sys", label: "收缩压（高压）", type: "num" },
    { k: "v_dia", label: "舒张压（低压）", type: "num" },
    { k: "v_hr", label: "心率", type: "num" },
    { k: "v_temp", label: t("体温（{u}）", { u: unitOf("temp", s) }), type: "num", step: .1 },
    { k: "v_spo2", label: "血氧 %", type: "num" },
    { k: "h_d", type: "html", html: () => fh("医生说了什么") },
    { k: "diagnosis", label: "诊断", type: "area", rows: 2 },
    { k: "advice", label: "医生建议", type: "area", rows: 3, ph: "减重 5%、少盐、三个月后复查血脂……", hint: "原话记下来，以后推荐饮食和锻炼按这个来" },
    { k: "follow_up", label: "复诊日期", type: "date", hint: "填了会出现在待办和日历订阅里" },
    { k: "notes", label: "备注", type: "area", rows: 2 },
    { k: "h_labs", type: "html", html: d => labsPreview(d) }
  ], init, async d => {
    if (!d.day) { toast(t("请填日期")); return; }
    const vitals = { weight_kg: fromShow("weight", d.v_weight, s), height_cm: fromShow("length", d.v_height, s), sys: d.v_sys, dia: d.v_dia, hr: d.v_hr, temp_c: fromShow("temp", d.v_temp, s), spo2: d.v_spo2 };
    Object.keys(vitals).forEach(k => { if (vitals[k] == null || vitals[k] === "") delete vitals[k]; });
    const row = { ...(v ? { id: v.id } : {}), subject: d.subject, day: d.day, kind: d.kind || "regular", place: d.place || "", location: d.location || "", provider: d.provider || "", reason: d.reason || "", vitals, diagnosis: d.diagnosis || "", advice: d.advice || "", follow_up: d.follow_up || null, notes: d.notes || "", ai_used: !!d.ai_used };
    const saved = await hl.save("visits", row);
    if (d._labs && d._labs.length) await hl.saveMany("labs", d._labs.map(x => labRow({ ...x, day: x.day || d.day }, d.subject, saved.id, true)));
    closeSheet(); toast(d._labs && d._labs.length ? t("已保存，另存了 {n} 项化验", { n: d._labs.length }) : t("已保存"));
  }, v ? async () => { if (!confirm(t("删除这次就诊？挂在上面的化验会保留。"))) return; await hl.remove("visits", v.id); if (UI().view === "visit") UI().view = "visits"; closeSheet(); toast(t("已删除")); } : null);
}
const labRow = (x, subject, visitId = null, ai = false) => ({ subject, day: x.day, visit_id: visitId, code: x.code || "", name: x.code ? "" : String(x.name || "").slice(0, 80), value: +x.value, unit: x.unit || "", ref_low: x.ref_low ?? null, ref_high: x.ref_high ?? null, notes: x.notes || "", ai_used: ai });
const codeSelect = d => `<div class="field" style="margin:0"><label for="f_code">${t("项目")}</label><select id="f_code" data-f="code">
  ${Object.entries(LAB_GROUPS).map(([g, gl]) => { const items = Object.entries(LABS).filter(([, x]) => x.group === g); return items.length ? `<optgroup label="${esc(t(gl))}">${items.map(([k, x]) => `<option value="${k}" ${d.code === k ? "selected" : ""}>${esc(lang() === "en" ? x.en : x.name)}</option>`).join("")}</optgroup>` : ""; }).join("")}
  <option value="" ${!d.code ? "selected" : ""}>${t("其他（自己填名字）")}</option></select></div>`;
function openLab(x){
  const init = x ? { ...x } : { subject: UI().who, day: today(), code: "ldl", unit: LABS.ldl.unit, ref_low: LABS.ldl.low, ref_high: LABS.ldl.high };
  openForm(x ? "编辑化验" : "记一份化验", [
    ...(x ? [] : [{ k: "h_ai", type: "html", html: d => aiBtn("lab", d) }]),
    whoField(),
    { k: "day", label: "日期", type: "date" },
    { k: "h_labs", type: "html", html: d => labsPreview(d) },
    { k: "code", type: "html", html: d => (d._labs && d._labs.length ? "" : codeSelect(d)) },
    { k: "name", label: "项目名称", type: "text", when: d => !d.code && !(d._labs && d._labs.length) },
    { k: "value", label: "结果", type: "num", step: .01, when: d => !(d._labs && d._labs.length) },
    { k: "unit", label: "单位", type: "text", when: d => !(d._labs && d._labs.length) },
    { k: "ref_low", label: "参考下限", type: "num", step: .01, when: d => !(d._labs && d._labs.length) },
    { k: "ref_high", label: "参考上限", type: "num", step: .01, when: d => !(d._labs && d._labs.length), hint: "按化验单上的范围改；偏高 / 偏低按这里判断" },
    { k: "notes", label: "备注", type: "text", when: d => !(d._labs && d._labs.length) }
  ], init, async d => {
    if (!d.day) { toast(t("请填日期")); return; }
    if (d._labs && d._labs.length) { await hl.saveMany("labs", d._labs.map(r => labRow({ ...r, day: r.day || d.day }, d.subject, null, true))); closeSheet(); toast(t("已保存 {n} 项化验", { n: d._labs.length })); return; }
    if (d.value == null || (!d.code && !d.name)) { toast(t("请填项目和结果")); return; }
    await hl.save("labs", { ...(x ? { id: x.id, visit_id: x.visit_id } : {}), ...labRow(d, d.subject, x ? x.visit_id : null, x ? x.ai_used : false) });
    closeSheet(); toast(t("已保存"));
  }, x ? async () => { if (!confirm(t("删除这一项化验？"))) return; await hl.remove("labs", x.id); closeSheet(); toast(t("已删除")); } : null);
}
/* ---- 录入一整份化验（2026-11-02）：按套餐列出全部项目一次填；或者拍化验单 / 门户截图（可多张）、粘贴文字，让 AI 把所有套餐一起填好 ----
   draft.vals = { code: { value, unit, ref_low, ref_high } }；对不上内置项目的放 draft.extra = [{ name, value, unit, ref_low, ref_high }]。
   表里改的数字马上记进 draft（input 事件），切换套餐 / 重画不会丢。保存时只存填了数字的。 */
const filledVal = v => v && v.value !== "" && v.value != null && Number.isFinite(+v.value);
function batchCount(d, g){ return Object.entries(d.vals || {}).filter(([c, v]) => filledVal(v) && LABS[c] && LABS[c].group === g).length + (g === "other" ? (d.extra || []).filter(filledVal).length : 0); }
function batchTable(d){
  const g = d.panel || "lipid", items = Object.entries(LABS).filter(([, x]) => x.group === g);
  const cell = (key, k, v, w = "") => `<input class="hl-bt-in ${w}" data-bt="${esc(key)}" data-k="${k}" type="${k === "unit" || k === "name" ? "text" : "number"}" ${k === "unit" || k === "name" ? "" : 'inputmode="decimal" step="any"'} value="${esc(v ?? "")}" placeholder="${esc(t({ value: "结果", unit: "单位", ref_low: "下限", ref_high: "上限", name: "项目名称" }[k]))}" aria-label="${esc(t({ value: "结果", unit: "单位", ref_low: "参考下限", ref_high: "参考上限", name: "项目名称" }[k]))}">`;
  const row = (key, label, v, def) => {
    const x = { value: v.value, ref_low: v.ref_low !== undefined ? v.ref_low : def.low, ref_high: v.ref_high !== undefined ? v.ref_high : def.high }, f = filledVal(v) ? labFlag(x) : null;
    return `<tr class="${f ? "flag-" + f : ""}"><th scope="row">${label}</th><td>${cell(key, "value", v.value, "v")}</td><td class="hl-bt-unit">${cell(key, "unit", v.unit ?? def.unit, "u")}</td>
      <td class="hl-bt-rng">${cell(key, "ref_low", x.ref_low, "r")}<span aria-hidden="true">–</span>${cell(key, "ref_high", x.ref_high, "r")}</td>
      <td class="hl-bt-f">${f ? `<span class="pill ${f === "high" ? "hi" : "lo"}">${t(f === "high" ? "偏高" : "偏低")}</span>` : ""}</td></tr>`;
  };
  const rows = items.map(([c, x]) => row(c, esc(lang() === "en" ? x.en : x.name), (d.vals || {})[c] || {}, x)).join("")
    + (g === "other" ? (d.extra || []).map((v, i) => row("x" + i, cell("x" + i, "name", v.name, "n"), v, { unit: "", low: null, high: null })).join("") : "");
  return `<div class="scroll-x"><table class="hl-bt"><thead><tr><th scope="col">${t("项目")}</th><th scope="col">${t("结果")}</th><th scope="col">${t("单位")}</th><th scope="col">${t("参考范围")}</th><th scope="col"><span class="sr-only">${t("提示")}</span></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${g === "other" ? `<button type="button" class="chip" data-hl="bt-extra">＋ ${t("加一项（单子上别的项目）")}</button>` : ""}`;
}
function openLabBatch(init = {}){
  const who = UI().who;
  const draft = { subject: who, day: today(), panel: "lipid", vals: {}, extra: [], visit_id: "", ...init };
  if (!draft.visit_id) { const v = S.hl.visits.filter(x => x.subject === draft.subject && Math.abs(daysBetween(x.day, draft.day)) <= 45).sort((a, b) => b.day.localeCompare(a.day))[0]; if (v) draft.visit_id = v.id; }
  openForm("录入化验", [
    { k: "h_ai", type: "html", html: d => `<div class="hl-ai"><button type="button" class="btn" data-hl="ai-read" data-v="labs">📷 ${t("拍照 / 截图读取（可多张）")}</button><button type="button" class="btn" data-hl="bt-paste">📋 ${t("粘贴文字")}</button>
      <span class="small muted">${d._aiBusy ? t("正在读取…") : d.ai_used ? t("已经用 AI 读过，保存前请核对。") : t("门户（MyChart 等）每个套餐截一张图，或者把结果页的文字复制过来；AI 会把每一项填进下面的表，范围按单子上的。")}</span>
      ${d._paste ? `<textarea id="hlPaste" class="hl-paste" placeholder="${esc(t("把化验结果页的文字粘贴在这里"))}">${esc(d._pasteText || "")}</textarea><button type="button" class="btn primary" data-hl="bt-paste-read">${t("读取粘贴的文字")}</button>` : ""}</div>` },
    whoField(),
    { k: "day", label: "采样日期", type: "date" },
    { k: "visit_id", type: "html", html: d => { const vs = S.hl.visits.filter(x => x.subject === d.subject).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 12);
      return vs.length ? `<div class="field" style="margin:0"><label for="f_visit">${t("挂在哪次就诊上（可不选）")}</label><select id="f_visit" data-f="visit_id"><option value="">${t("不挂")}</option>${vs.map(v => `<option value="${esc(v.id)}" ${d.visit_id === v.id ? "selected" : ""}>${esc(fmtDay(v.day))} · ${esc(t((VISIT_KINDS[v.kind] || VISIT_KINDS.other).label))}${v.provider ? " · " + esc(v.provider) : ""}</option>`).join("")}</select></div>` : ""; } },
    { k: "panel", label: "套餐", type: "seg", optsFn: d => Object.entries(LAB_GROUPS).map(([g, l]) => [g, `${t(l)}${batchCount(d, g) ? ` · ${batchCount(d, g)}` : ""}`]), raw: true },
    { k: "h_tbl", type: "html", html: d => batchTable(d) },
    { k: "fasting", label: "空腹采血", type: "check" },
    { k: "h_sum", type: "html", html: d => { const n = Object.keys(LAB_GROUPS).reduce((a, g) => a + batchCount(d, g), 0); return `<p class="small muted" style="margin:0">${n ? t("将保存 {n} 项（只存填了结果的）。", { n }) : t("填了结果的项目才会保存。")}</p>`; } }
  ], draft, async d => {
    if (!d.day) { toast(t("请填日期")); return; }
    const out = [], num2 = v => (v === "" || v == null ? null : +v);
    for (const [c, v] of Object.entries(d.vals || {})) if (filledVal(v) && LABS[c]) out.push({ code: c, value: +v.value, unit: v.unit ?? LABS[c].unit, ref_low: v.ref_low !== undefined ? v.ref_low : LABS[c].low, ref_high: v.ref_high !== undefined ? v.ref_high : LABS[c].high });
    for (const v of d.extra || []) if (filledVal(v) && v.name) out.push({ code: "", name: v.name, value: +v.value, unit: v.unit || "", ref_low: v.ref_low ?? null, ref_high: v.ref_high ?? null });
    if (!out.length) { toast(t("请至少填一项结果")); return; }
    await hl.saveMany("labs", out.map(x => labRow({ ...x, ref_low: num2(x.ref_low), ref_high: num2(x.ref_high), day: d.day, notes: d.fasting ? t("空腹") : "" }, d.subject, d.visit_id || null, !!d.ai_used)));
    UI().labGroup = null; closeSheet(); toast(t("已保存 {n} 项化验", { n: out.length }));
  });
}
/** AI 读出来的化验 → 填进表（对上的按代码，对不上的放「其他」）；切到项目最多的那一套 */
function fillBatch(d, labs, extra = {}){
  d.vals ||= {}; d.extra ||= [];
  for (const x of labs) {
    if (x.code) d.vals[x.code] = { value: x.value, unit: x.unit || LABS[x.code].unit, ref_low: x.ref_low, ref_high: x.ref_high };
    else d.extra.push({ name: x.name, value: x.value, unit: x.unit, ref_low: x.ref_low, ref_high: x.ref_high });
  }
  if (extra.day) d.day = extra.day;
  if (extra.fasting) d.fasting = true;
  const counts = Object.keys(LAB_GROUPS).map(g => [g, batchCount(d, g)]).sort((a, b) => b[1] - a[1]);
  if (counts[0][1]) d.panel = counts[0][0];
  d.ai_used = true;
}
// 表里改数字：马上记进 draft（不重画，光标不跳）；离开结果格子时重画一次，偏高 / 偏低跟着变
document.addEventListener("input", ev => {
  const el = ev.target; if (!el || !el.dataset || el.dataset.bt === undefined) return;
  const f = getForm(); if (!f) return;
  const key = el.dataset.bt, k = el.dataset.k, v = el.value.trim(), val = k === "unit" || k === "name" ? v : v === "" ? (k === "value" ? "" : null) : +v;
  if (key.startsWith("x")) { const i = +key.slice(1); (f.draft.extra[i] ||= {})[k] = val; }
  else ((f.draft.vals ||= {})[key] ||= {})[k] = val;
});
document.addEventListener("change", ev => { const el = ev.target; if (el && el.dataset && el.dataset.bt !== undefined && el.dataset.k === "value") { readForm(); drawForm(); } });

function openMeasure(m){
  const s = sys();
  const init = m ? { ...m, value: m.kind === "bp" ? m.value : toShow(MEASURE_KINDS[m.kind].dim, m.value, s) } : { subject: UI().who, day: today(), kind: "weight" };
  const unitL = d => (d.kind === "bp" ? "mmHg" : unitOf(MEASURE_KINDS[d.kind || "weight"].dim, s));
  openForm(m ? "编辑测量" : "记一次测量", [
    whoField(),
    { k: "day", label: "日期", type: "date" },
    { k: "kind", label: "测什么", type: "seg", opts: Object.entries(MEASURE_KINDS).map(([k, x]) => [k, `${x.icon} ${t(x.label)}`]), raw: true },
    { k: "h_u", type: "html", html: d => `<div class="small muted">${t("单位：{u}", { u: unitL(d) })}</div>` },
    { k: "value", label: "数值", type: "num", step: .1, when: d => d.kind !== "bp" },
    { k: "value_bp", label: "收缩压（高压）", type: "num", when: d => d.kind === "bp" },
    { k: "value2", label: "舒张压（低压）", type: "num", when: d => d.kind === "bp" },
    { k: "notes", label: "备注", type: "text", ph: "早上空腹 / 运动后" }
  ], m && m.kind === "bp" ? { ...init, value_bp: m.value } : init, async d => {
    const k = d.kind || "weight", raw = k === "bp" ? d.value_bp : d.value;
    if (!d.day || raw == null) { toast(t("请填日期和数值")); return; }
    await hl.save("measures", { ...(m ? { id: m.id } : {}), subject: d.subject, day: d.day, kind: k, value: k === "bp" ? raw : fromShow(MEASURE_KINDS[k].dim, raw, s), value2: k === "bp" ? d.value2 : null, notes: d.notes || "" });
    closeSheet(); toast(t("已保存"));
  }, m ? async () => { if (!confirm(t("删除这条测量？"))) return; await hl.remove("measures", m.id); closeSheet(); toast(t("已删除")); } : null);
}
function openProfile(){
  const ui = UI(), who = hl.person(ui.who), s = sys(), p = (hl.profileOf(ui.who) || {}).data || {};
  openForm(t("{name} 的健康档案", { name: who.name }), [
    ...(who.kid ? [] : [{ k: "birth", label: "出生日期", type: "date" }]),
    { k: "sex", label: "性别", type: "seg", opts: [["f", "女"], ["m", "男"], ["o", "其他"]] },
    ...(who.kid ? [] : [{ k: "height", label: t("身高（{u}）", { u: unitOf("length", s) }), type: "num", step: .1, hint: "算 BMI 用；就诊记了身高就以最近一次为准" }]),
    { k: "allergies", label: "过敏", type: "text", ph: "青霉素、花生……" },
    { k: "conditions", label: "既往病史", type: "area", rows: 2, ph: "高血压、甲减、哮喘……" },
    { k: "meds", label: "长期用药", type: "area", rows: 2, ph: "药名和剂量；每天提醒在「用药与保健品」里设" },
    { k: "goals", label: "目标", type: "area", rows: 2, ph: "体重减 5 kg、LDL < 100、每周运动 150 分钟" },
    { k: "notes", label: "备注", type: "area", rows: 2 }
  ], { ...p, height: toShow("length", p.height_cm, s) }, async d => {
    const data = { ...p, sex: d.sex || null, allergies: d.allergies || "", conditions: d.conditions || "", meds: d.meds || "", goals: d.goals || "", notes: d.notes || "" };
    if (!who.kid) { data.birth = d.birth || null; data.height_cm = fromShow("length", d.height, s); }
    await hl.saveProfile(ui.who, data); closeSheet(); toast(t("已保存"));
  });
}

/* ---- AI 读图：照片在浏览器里压缩后发给用户自己配置的 AI（第一次问一下），只要 JSON，结果预填表单 ---- */
const AI_OK = LS_PREFIX + ".hlAiOk";
async function shrink(file, max = 1800){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t("这张图片打不开"))); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { mime: "image/jpeg", b64: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
function aiRead(mode){
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return; }
  if (!loadJSON(AI_OK, false)) {
    if (!confirm(t("照片会发给你自己设置的 AI 服务商来读取（只要数字和医生建议，提示里要求它不要读姓名、生日、地址）；牧羊人不保存照片。继续吗？"))) return;
    saveJSON(AI_OK, true);
  }
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async () => {
    const files = [...inp.files].slice(0, 6); if (!files.length) return;   // 代谢综合常常要截 3 张
    readForm(); const f = getForm(); if (!f) return;
    f.draft._aiBusy = true; drawForm();
    try {
      const images = []; for (const x of files) images.push(await shrink(x));
      const r = parseExtract(await askText(EXTRACT_SYSTEM, mode === "visit" ? "Read this after-visit summary (and any lab results on it)." : "Read every lab result on these pages.", { json: true, images, maxTokens: 4000 }));
      if (!r) throw new Error(t("没读出内容，换一张清楚点的照片试试"));
      const d = getForm().draft;
      if (r.day) d.day = r.day;
      if (mode === "visit") {
        const s = sys(), v = r.vitals;
        Object.assign(d, { kind: r.kind || d.kind, provider: r.provider || d.provider, reason: r.reason || d.reason, diagnosis: r.diagnosis || d.diagnosis, advice: r.advice || d.advice, follow_up: r.follow_up || d.follow_up,
          v_weight: v.weight_kg != null ? toShow("weight", v.weight_kg, s) : d.v_weight, v_height: v.height_cm != null ? toShow("length", v.height_cm, s) : d.v_height, v_sys: v.sys ?? d.v_sys, v_dia: v.dia ?? d.v_dia,
          v_hr: v.hr ?? d.v_hr, v_temp: v.temp_c != null ? toShow("temp", v.temp_c, s) : d.v_temp, v_spo2: v.spo2 ?? d.v_spo2 });
      }
      if (mode === "labs") { readForm(); fillBatch(getForm().draft, r.labs, r); }
      else { d._labs = r.labs; d.ai_used = true; }
      toast(r.labs.length ? t("读出 {n} 项化验，请核对", { n: r.labs.length }) : t("已读出，请核对"));
    } catch (e) { toast(t("读取失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
    finally { const g = getForm(); if (g) { g.draft._aiBusy = false; drawForm(); } }
  };
  inp.click();
}

/** 粘贴的化验结果文字 → AI 读成 JSON → 填进表（只发文字；第一次问一下） */
async function pasteRead(){
  readForm(); const f = getForm(); if (!f) return;
  const text = (document.getElementById("hlPaste") || {}).value || ""; f.draft._pasteText = text;
  if (!text.trim()) { toast(t("先粘贴文字")); return; }
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return; }
  if (!loadJSON(AI_OK, false)) { if (!confirm(t("粘贴的文字会发给你自己设置的 AI 服务商来整理（提示里要求它不要读姓名、生日、地址）。继续吗？"))) return; saveJSON(AI_OK, true); }
  f.draft._aiBusy = true; drawForm();
  try {
    const r = parseExtract(await askText(EXTRACT_SYSTEM, "Read every lab result in this text:" + String.fromCharCode(10) + text.slice(0, 20000), { json: true, maxTokens: 4000 }));
    if (!r || !r.labs.length) throw new Error(t("没读出化验结果"));
    fillBatch(getForm().draft, r.labs, r); getForm().draft._paste = false;
    toast(t("读出 {n} 项化验，请核对", { n: r.labs.length }));
  } catch (e) { toast(t("读取失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { const g = getForm(); if (g) { g.draft._aiBusy = false; drawForm(); } }
}

/* ---- 事件（events.js 把 data-hl 的按钮交给这里） ---- */
async function hlAct(act, btn){
  const ui = UI(), d = btn.dataset;
  switch (act) {
    case "who": ui.who = d.key; ui.metric = null; pg.reset("hlVisits", "hlMeasures", "hlWk"); render(); return;
    case "view": ui.view = d.v; render(); window.scrollTo(0, 0); return;
    case "metric": ui.metric = d.v; render(); requestAnimationFrame(() => document.querySelector(".hl-chart")?.scrollIntoView({ block: "nearest", behavior: "smooth" })); return;
    case "lab-open": ui.labKey = d.v; ui.back = ui.view; ui.view = "lab"; pg.reset("hlLabRec"); render(); window.scrollTo(0, 0); return;
    case "back": ui.view = ui.back && ui.back !== ui.view ? ui.back : parentView(ui.view) === ui.view ? "overview" : parentView(ui.view); ui.back = null; render(); window.scrollTo(0, 0); return;
    case "lab-chart": ui.metric = d.v; ui.view = "overview"; render(); return;
    case "units": saveJSON(UNIT_KEY, d.v); render(); return;
    case "new-visit": openVisit(null); return;
    case "new-lab": openLabBatch(); return;
    case "bt-extra": { readForm(); const f = getForm(); if (f) { f.draft.extra.push({ name: "", value: "", unit: "" }); f.draft.panel = "other"; drawForm(); } return; }
    case "bt-paste": { readForm(); const f = getForm(); if (f) { f.draft._paste = !f.draft._paste; drawForm(); requestAnimationFrame(() => document.getElementById("hlPaste")?.focus()); } return; }
    case "bt-paste-read": await pasteRead(); return;
    case "new-measure": openMeasure(null); return;
    case "edit-visit": { const v = S.hl.visits.find(x => x.id === d.id); if (v) openVisit(v); return; }
    case "open-visit": ui.visitId = d.id; ui.back = ui.view; ui.view = "visit"; render(); window.scrollTo(0, 0); return;
    case "edit-lab": { const x = S.hl.labs.find(y => y.id === d.id); if (x) openLab(x); return; }
    case "edit-measure": { const m = S.hl.measures.find(y => y.id === d.id); if (m) openMeasure(m); return; }
    case "edit-profile": openProfile(); return;
    case "ai-read": aiRead(d.v); return;
    case "ai-labs-clear": { readForm(); const f = getForm(); if (f) { f.draft._labs = []; drawForm(); } return; }
  }
  if (await visitAct(act, d)) return;   // 就诊列表 / 详情 / AI（js/health-visits.js）
  if (await labAct(act, d)) return;     // 化验单项页 / 套餐 AI（js/health-labs.js）
  await planAct(act, d);   // 计划 / 训练 / 饮食（js/health-plan-ui.js）
}
// 化验项目换了：单位和参考范围跟着换（只在没改过的时候）
document.addEventListener("change", ev => { if (ev.target && ev.target.id === "hlLabGroup") { UI().labGroup = ev.target.value; render(); } });
document.addEventListener("change", ev => { if (ev.target && ev.target.id === "f_subject" && getForm()) { readForm(); drawForm(); } });
// 手机头部的两个下拉框：换人、换页
document.addEventListener("change", ev => {
  const id = ev.target && ev.target.id; if (id !== "hlWho" && id !== "hlView") return;
  const ui = UI(); if (id === "hlWho") { ui.who = ev.target.value; ui.metric = null; ui.labGroup = null; pg.reset("hlVisits", "hlMeasures", "hlWk"); } else ui.view = ev.target.value;
  render(); window.scrollTo(0, 0);
});
// 「＋ 记一笔」小菜单：点了一项就收起
document.addEventListener("click", ev => { const m = ev.target.closest && ev.target.closest(".hl-addmenu"); document.querySelectorAll(".hl-addmenu[open]").forEach(d => { if (d !== m || ev.target.closest("[data-hl]")) d.open = false; }); });
document.addEventListener("change", ev => {
  if (!ev.target || ev.target.id !== "f_code") return;
  readForm(); const f = getForm(); if (!f) return;
  const x = LABS[f.draft.code]; if (x) Object.assign(f.draft, { unit: x.unit, ref_low: x.low, ref_high: x.high, name: "" });
  drawForm();
});

/** 给咩咩咩 / 今天页用：这个人最要紧的几条待办（以后用） */
const healthDue = key => dueItems({ data: hl.dataOf(key), today: S.day, kid: key.startsWith("c:") });

export { viewHealth, hlAct, healthDue, UI, sys, lang, fmtDay, metricMeta, chartPanel, visitCard, vitalsText, latestLabs, labLine, byOrder, openVisit, openLab, openLabBatch, profileData0 as profileData };
