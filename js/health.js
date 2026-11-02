import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { LABS, LAB_GROUPS, MEASURE_KINDS, VISIT_KINDS } from "./data/health-ref.js";
import { EXTRACT_SYSTEM, ageYears, bmiOf, daysBetween, dueItems, fromShow, labFlag, labName, latest, metricFlag, metricsOf, parseExtract, series, toShow, unitOf } from "./health-lib.js";
import * as hl from "./hl.js";
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
const VIEWS = [["overview", "概览"], ["visits", "就诊"], ["labs", "化验"], ["measures", "测量"], ["profile", "档案"]];
const fmtDay = d => (d ? d.replace(/-/g, "/") : "");

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

/* ---- 页面 ---- */
function viewHealth(){
  if (S.hl.error === "missing") return `<div class="empty">${t("数据库还没有健康的表。")}<br>${t("请在 Supabase 执行 baby-log 仓库本地的")} <code>supabase/migrations/026_shepherd_health.sql</code>${t("，然后刷新。")}</div>`;
  if (S.hl.error) return `<div class="empty">${t("读取健康记录失败。")}<br>${t("请刷新重试。")}</div>`;
  if (!S.hl.loaded) return `<div class="empty">${t("正在读取…")}</div>`;
  const ui = UI(), ppl = hl.people();
  if (!ppl.some(p => p.key === ui.who)) ui.who = ppl[0] ? ppl[0].key : null;
  if (!ui.who) return `<div class="empty">${t("先登录。")}</div>`;
  const who = hl.person(ui.who);
  const add = `<span class="hl-add">${["visit", "lab", "measure"].map(k => `<button class="chip" data-hl="new-${k}">＋ ${t({ visit: "就诊", lab: "化验", measure: "测量" }[k])}</button>`).join("")}</span>`;
  const chips = `<div class="chips hl-people" role="group" aria-label="${esc(t("看谁的"))}">${ppl.map(p => `<button class="chip" data-hl="who" data-key="${esc(p.key)}" aria-pressed="${p.key === ui.who}">${p.kid ? "🧒 " : ""}${esc(p.name)}${p.me ? ` <span class="cnt">${t("我")}</span>` : ""}</button>`).join("")}</div>`;
  const tabs = `<div class="chips hl-views" role="group" aria-label="${esc(t("健康内容"))}">${VIEWS.map(([k, l]) => `<button class="chip" data-hl="view" data-v="${k}" aria-pressed="${ui.view === k}">${t(l)}</button>`).join("")}</div>`;
  const body = { overview: overviewHTML, visits: visitsHTML, labs: labsHTML, measures: measuresHTML, profile: profileHTML }[ui.view] || overviewHTML;
  return `${pageHead(t("家人健康"), add)}${chips}${tabs}${body(who)}
    <p class="small muted hl-foot">${t("这里只做记录和按公开指南的提醒，不是诊断；有疑问以医生意见为准。家里的人都看得到这家人的健康记录。")}</p>`;
}

/* 概览：左栏（待办、最近一次就诊）+ 右栏（关键指标、走势图） */
function overviewHTML(who){
  const ui = UI(), data = hl.dataOf(who.key), prof = (hl.profileOf(who.key) || {}).data || {};
  const heightCm = prof.height_cm || null, kid = who.kid;
  const metrics = metricsOf(data, { kid, heightCm });
  if (!metrics.includes(ui.metric)) ui.metric = metrics[0] || null;
  const due = dueItems({ data, today: S.day, kid });
  const left = `${secHead(t("待办"))}${dueHTML(due, kid)}${lastVisitHTML(data)}${kid ? `<p class="small muted" style="margin-top:10px">${t("孩子的身高体重和体检日程以小月亮为准，这里只读。")} <a href="https://dev-hyang.github.io/baby-log/" target="_blank" rel="noopener">${t("去小月亮")} ↗</a></p>` : ""}`;
  if (!metrics.length) return `<div class="hl-grid"><div class="hl-col">${left}</div><div class="hl-col">${secHead(t("关键指标"))}<div class="panel empty">${t("还没有数字。记一次就诊（带体征）、一份化验或一次在家测量，这里就会出现走势。")}<br>
    <button class="btn primary" data-hl="new-visit">${t("记一次就诊")}</button> <button class="btn" data-hl="new-measure">${t("记一次测量")}</button></div></div></div>`;
  const cards = metrics.map(m => {
    const meta = metricMeta(m, data), s = series(m, data, { heightCm }), l = latest(s), f = metricFlag(m, l, data, { kid });
    const delta = l && l.delta != null && m !== "bp" ? `<span class="d">${l.delta > 0 ? "↑" : l.delta < 0 ? "↓" : "→"} ${Math.abs(meta.dim ? toShow(meta.dim, Math.abs(l.delta), sys()) : l.delta)}</span>` : "";
    return `<button class="kpi hl-kpi ${ui.metric === m ? "sel" : ""}" data-hl="metric" data-v="${esc(m)}" aria-pressed="${ui.metric === m}">
      <span class="k">${esc(meta.name)}</span><b class="v num">${showPoint(m, meta, l)}<small> ${esc(meta.unit)}</small></b>
      <span class="hl-kpi-foot">${f ? `<span class="pill ${f.level === "high" ? "hi" : "lo"}">${esc(t(f.text))}</span>` : `<span class="small muted">${fmtDay(l.day)}</span>`}${delta}</span>
      ${spark(s)}</button>`;
  }).join("");
  const right = `${secHead(t("关键指标"))}<div class="kpis hl-kpis">${cards}</div>${ui.metric ? chartPanel(ui.metric, data, { heightCm, kid }) : ""}`;
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
  return `<button class="panel hl-visit" data-hl="edit-visit" data-id="${esc(v.id)}">
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
  return `<div class="panel hl-chart"><div class="hl-chart-head"><b>${esc(meta.name)}</b>${legend}</div>${svg(560, 230, "hl-w")}${svg(360, 220, "hl-n")}${table}</div>`;
}
/** 卡片里的小走势线 */
function spark(s){
  if (s.length < 2) return "";
  const W = 100, H = 24, vs = s.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const pts = s.slice(-12).map((p, i, a) => `${(i / Math.max(1, a.length - 1) * W).toFixed(1)},${(H - 2 - (p.v - lo) / sp * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="hl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

/* 就诊：时间倒序，分页 */
function visitsHTML(who){
  const data = hl.dataOf(who.key), list = [...data.visits].sort((a, b) => b.day.localeCompare(a.day));
  if (!list.length) return `<div class="panel empty">${t("还没有就诊记录。")}<br><button class="btn primary" data-hl="new-visit">${t("记一次就诊")}</button></div>`;
  return `<div class="hl-list">${pg.page("hlVisits", list).map(v => visitCard(v, data)).join("")}</div>${pg.moreBtn("hlVisits", list.length)}`;
}
/* 化验：按项目分组，每项最新值 + 历史 */
function labsHTML(who){
  const data = hl.dataOf(who.key);
  if (!data.labs.length) return `<div class="panel empty">${t("还没有化验记录。")}<br><button class="btn primary" data-hl="new-lab">${t("记一份化验")}</button></div>`;
  const by = new Map(); for (const x of [...data.labs].sort((a, b) => b.day.localeCompare(a.day))) { const k = x.code || x.name; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  const groupOf = k => (LABS[k] ? LABS[k].group : "other");
  const groups = Object.keys(LAB_GROUPS).filter(g => [...by.keys()].some(k => groupOf(k) === g));
  return groups.map(g => `${secHead(t(LAB_GROUPS[g]))}<div class="panel mlist">${[...by].filter(([k]) => groupOf(k) === g).map(([k, rows]) => {
    const x = rows[0], f = labFlag(x), range = x.ref_low != null && x.ref_high != null ? `${x.ref_low}–${x.ref_high}` : x.ref_high != null ? `< ${x.ref_high}` : x.ref_low != null ? `> ${x.ref_low}` : "";
    return `<div class="hl-lab"><button class="hl-lab-main" data-hl="lab-chart" data-v="${esc("lab:" + k)}"><b>${esc(labName(x, lang()))}</b>
        <small>${t("参考 {r}", { r: range || "—" })} · ${t("{n} 次", { n: rows.length })}</small></button>
      <span class="hl-lab-hist">${rows.slice(0, 4).map(r => `<button class="hl-lab-v ${labFlag(r) ? "flag-" + labFlag(r) : ""}" data-hl="edit-lab" data-id="${esc(r.id)}" title="${esc(fmtDay(r.day))}"><b class="num">${esc(+(+r.value).toFixed(2))}</b><small>${fmtDay(r.day).slice(2)}</small></button>`).join("")}</span>
      <span class="hl-lab-unit small muted">${esc(x.unit || "")}${f ? ` <span class="pill ${f === "high" ? "hi" : "lo"}">${t(f === "high" ? "偏高" : "偏低")}</span>` : ""}</span></div>`;
  }).join("")}</div>`).join("");
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
    { k: "subject", label: "谁", type: "seg", optsFn: peopleOpts, raw: true },
    { k: "day", label: "日期", type: "date" },
    { k: "kind", label: "类型", type: "seg", opts: Object.entries(VISIT_KINDS).map(([k, x]) => [k, `${x.icon} ${t(x.label)}`]), raw: true },
    { k: "provider", label: "医院 / 医生", type: "text", ph: "例如 Dr. Lee · 家庭医生" },
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
    const row = { ...(v ? { id: v.id } : {}), subject: d.subject, day: d.day, kind: d.kind || "regular", provider: d.provider || "", reason: d.reason || "", vitals, diagnosis: d.diagnosis || "", advice: d.advice || "", follow_up: d.follow_up || null, notes: d.notes || "", ai_used: !!d.ai_used };
    const saved = await hl.save("visits", row);
    if (d._labs && d._labs.length) await hl.saveMany("labs", d._labs.map(x => labRow({ ...x, day: x.day || d.day }, d.subject, saved.id, true)));
    closeSheet(); toast(d._labs && d._labs.length ? t("已保存，另存了 {n} 项化验", { n: d._labs.length }) : t("已保存"));
  }, v ? async () => { if (!confirm(t("删除这次就诊？挂在上面的化验会保留。"))) return; await hl.remove("visits", v.id); closeSheet(); toast(t("已删除")); } : null);
}
const labRow = (x, subject, visitId = null, ai = false) => ({ subject, day: x.day, visit_id: visitId, code: x.code || "", name: x.code ? "" : String(x.name || "").slice(0, 80), value: +x.value, unit: x.unit || "", ref_low: x.ref_low ?? null, ref_high: x.ref_high ?? null, notes: x.notes || "", ai_used: ai });
const codeSelect = d => `<div class="field" style="margin:0"><label for="f_code">${t("项目")}</label><select id="f_code" data-f="code">
  ${Object.entries(LAB_GROUPS).map(([g, gl]) => { const items = Object.entries(LABS).filter(([, x]) => x.group === g); return items.length ? `<optgroup label="${esc(t(gl))}">${items.map(([k, x]) => `<option value="${k}" ${d.code === k ? "selected" : ""}>${esc(lang() === "en" ? x.en : x.name)}</option>`).join("")}</optgroup>` : ""; }).join("")}
  <option value="" ${!d.code ? "selected" : ""}>${t("其他（自己填名字）")}</option></select></div>`;
function openLab(x){
  const init = x ? { ...x } : { subject: UI().who, day: today(), code: "ldl", unit: LABS.ldl.unit, ref_low: LABS.ldl.low, ref_high: LABS.ldl.high };
  openForm(x ? "编辑化验" : "记一份化验", [
    ...(x ? [] : [{ k: "h_ai", type: "html", html: d => aiBtn("lab", d) }]),
    { k: "subject", label: "谁", type: "seg", optsFn: peopleOpts, raw: true },
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
function openMeasure(m){
  const s = sys();
  const init = m ? { ...m, value: m.kind === "bp" ? m.value : toShow(MEASURE_KINDS[m.kind].dim, m.value, s) } : { subject: UI().who, day: today(), kind: "weight" };
  const unitL = d => (d.kind === "bp" ? "mmHg" : unitOf(MEASURE_KINDS[d.kind || "weight"].dim, s));
  openForm(m ? "编辑测量" : "记一次测量", [
    { k: "subject", label: "谁", type: "seg", optsFn: peopleOpts, raw: true },
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
    const files = [...inp.files].slice(0, 4); if (!files.length) return;
    readForm(); const f = getForm(); if (!f) return;
    f.draft._aiBusy = true; drawForm();
    try {
      const images = []; for (const x of files) images.push(await shrink(x));
      const r = parseExtract(await askText(EXTRACT_SYSTEM, mode === "visit" ? "Read this after-visit summary (and any lab results on it)." : "Read the lab results in this report.", { json: true, images, maxTokens: 3000 }));
      if (!r) throw new Error(t("没读出内容，换一张清楚点的照片试试"));
      const d = getForm().draft;
      if (r.day) d.day = r.day;
      if (mode === "visit") {
        const s = sys(), v = r.vitals;
        Object.assign(d, { kind: r.kind || d.kind, provider: r.provider || d.provider, reason: r.reason || d.reason, diagnosis: r.diagnosis || d.diagnosis, advice: r.advice || d.advice, follow_up: r.follow_up || d.follow_up,
          v_weight: v.weight_kg != null ? toShow("weight", v.weight_kg, s) : d.v_weight, v_height: v.height_cm != null ? toShow("length", v.height_cm, s) : d.v_height, v_sys: v.sys ?? d.v_sys, v_dia: v.dia ?? d.v_dia,
          v_hr: v.hr ?? d.v_hr, v_temp: v.temp_c != null ? toShow("temp", v.temp_c, s) : d.v_temp, v_spo2: v.spo2 ?? d.v_spo2 });
      }
      d._labs = r.labs; d.ai_used = true;
      toast(r.labs.length ? t("读出 {n} 项化验，请核对", { n: r.labs.length }) : t("已读出，请核对"));
    } catch (e) { toast(t("读取失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
    finally { const g = getForm(); if (g) { g.draft._aiBusy = false; drawForm(); } }
  };
  inp.click();
}

/* ---- 事件（events.js 把 data-hl 的按钮交给这里） ---- */
async function hlAct(act, btn){
  const ui = UI(), d = btn.dataset;
  switch (act) {
    case "who": ui.who = d.key; ui.metric = null; pg.reset("hlVisits", "hlMeasures"); render(); return;
    case "view": ui.view = d.v; render(); window.scrollTo(0, 0); return;
    case "metric": ui.metric = d.v; render(); return;
    case "lab-chart": ui.metric = d.v; ui.view = "overview"; render(); return;
    case "units": saveJSON(UNIT_KEY, d.v); render(); return;
    case "new-visit": openVisit(null); return;
    case "new-lab": openLab(null); return;
    case "new-measure": openMeasure(null); return;
    case "edit-visit": { const v = S.hl.visits.find(x => x.id === d.id); if (v) openVisit(v); return; }
    case "edit-lab": { const x = S.hl.labs.find(y => y.id === d.id); if (x) openLab(x); return; }
    case "edit-measure": { const m = S.hl.measures.find(y => y.id === d.id); if (m) openMeasure(m); return; }
    case "edit-profile": openProfile(); return;
    case "ai-read": aiRead(d.v); return;
    case "ai-labs-clear": { readForm(); const f = getForm(); if (f) { f.draft._labs = []; drawForm(); } return; }
  }
}
// 化验项目换了：单位和参考范围跟着换（只在没改过的时候）
document.addEventListener("change", ev => {
  if (!ev.target || ev.target.id !== "f_code") return;
  readForm(); const f = getForm(); if (!f) return;
  const x = LABS[f.draft.code]; if (x) Object.assign(f.draft, { unit: x.unit, ref_low: x.low, ref_high: x.high, name: "" });
  drawForm();
});

/** 给咩咩咩 / 今天页用：这个人最要紧的几条待办（以后用） */
const healthDue = key => dueItems({ data: hl.dataOf(key), today: S.day, kid: key.startsWith("c:") });

export { viewHealth, hlAct, healthDue };
