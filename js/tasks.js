import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, newId, pad, toast } from "./core/util.js";
import { WEEKDAY, kindOf } from "./data/kinds.js";
import { addDays, addMonths, diffDays, periodEnd, recurText, weekStart, wdOf } from "./recur.js";
import { closeSheet, openForm, openInfo } from "./sheet.js";
import * as tk from "./tk.js";
import * as wb from "./wb.js";

/* ============ 任务页 + 今天页的任务块 ============
   任务页四段：今天 / 计划（日 周 月）/ 清单（大类 → 小类）/ 已完成。今天页只放“现在该做的”（催办条、三件大事、今日任务）。
   设计见 docs/design-tasks.md。 */
S.tkUi = S.tkUi || { seg: "today", range: "day", day: null, st: "open", prio: "all", q: "" };
const ui = () => S.tkUi;
const planDay = () => ui().day || S.day;

const PERIODS = [["day", "某一天"], ["week", "本周内"], ["month", "本月内"], ["quarter", "本季度"], ["year", "本年度"]];
const PERIOD_LABEL = { week: "本周", month: "本月", quarter: "本季度", year: "本年度" };
const shortDay = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const wdLabel = d => t("周{d}", { d: t(WEEKDAY[wdOf(d)]) });
const gate = () => (S.tk.error === "missing"
  ? `<div class="empty">${t("任务功能需要一次数据库升级。")}<br>${t("请在 Supabase 执行 docs/015_shepherd_tasks.sql（仓库里有），然后刷新。")}</div>`
  : S.tk.error ? `<div class="empty">${t("任务读取失败，请刷新重试。")}</div>` : !S.tk.loaded ? `<div class="empty">${t("正在读取…")}</div>` : "");

/* ---- 一行任务 ---- */
const PRIO_MARK = ["", "!", "!!", "!!!"];
function dueText(x, day = S.day){
  if (!x.due) return "";
  if ((x.period || "day") !== "day") return t(PERIOD_LABEL[x.period]);
  const d = diffDays(day, x.due);
  return d === 0 ? t("今天") : d === 1 ? t("明天") : d === -1 ? t("昨天") : `${shortDay(x.due)} ${wdLabel(x.due)}`;
}
/** x.virtual = 重复任务未来几次的展开：只看，不能勾 */
function row(x, { showDue = false, day = S.day } = {}){
  const c = tk.catOf(x.cat), late = tk.overdueDays(x, S.day), esc3 = tk.nudge().escalate && late ? (late >= 4 ? "late3" : late >= 2 ? "late2" : "late1") : "";
  const end = x.start_time && x.dur ? (() => { const [h, m] = x.start_time.split(":").map(Number), e = h * 60 + m + x.dur; return `${pad(Math.floor(e / 60) % 24)}:${pad(e % 60)}`; })() : "";
  const subs = x.subtasks || [], subDone = subs.filter(s => s.done).length;
  const meta = [x.start_time ? `${x.start_time}${end ? "–" + end : ""}` : "", x.dur && !x.start_time ? t("{n} 分钟", { n: x.dur }) : "", late ? `<b class="late-txt">${late === 1 ? t("昨天的") : t("逾期 {n} 天", { n: late })}</b>` : (showDue ? dueText(x, day) : ""),
    tk.catLabel(x), x.recur ? `⟳ ${esc(recurText(x, t))}` : "", subs.length ? t("{a}/{b} 步", { a: subDone, b: subs.length }) : "", x.slips >= 1 ? t("顺延 {n} 次", { n: x.slips }) : "", x.share === "family" ? "👪" : ""].filter(Boolean).join(" · ");
  const flag = x.prio ? `<span class="prio p${x.prio}" aria-label="${t("优先级")} ${x.prio}">${PRIO_MARK[x.prio]}</span>` : "";
  const stuck = x.slips >= 3 && !x.virtual;
  const acts = x.virtual ? "" : `<button class="iconbtn ok" data-act="tk-done" data-tid="${esc(x.id)}" aria-label="${x.kind === "event" ? t("去了") : t("完成")}">${x.kind === "event" ? t("去了") : "✓"}</button>${stuck ? "" : `<button class="iconbtn" data-act="tk-later" data-tid="${esc(x.id)}" aria-label="${t("顺延到明天")}" title="${t("顺延到明天")}">→</button>`}`;
  const subsHtml = subs.length && !x.virtual ? `<div class="subs">${subs.map((s, i) => `<button class="sub ${s.done ? "on" : ""}" data-act="tk-sub" data-tid="${esc(x.id)}" data-i="${i}" aria-pressed="${!!s.done}">${s.done ? "☑" : "☐"} ${esc(s.t)}</button>`).join("")}</div>` : "";
  const decide = stuck ? `<div class="stuck"><span>${t("这件事已经顺延 {n} 次了，现在决定吧：", { n: x.slips })}</span>
    <button class="chip" data-act="tk-now" data-tid="${esc(x.id)}">${t("现在做 25 分钟")}</button><button class="chip" data-act="tk-split" data-tid="${esc(x.id)}">${t("拆成小步")}</button><button class="chip" data-act="tk-edit" data-tid="${esc(x.id)}">${t("定个时间")}</button><button class="chip" data-act="tk-drop" data-tid="${esc(x.id)}">${t("放弃")}</button></div>` : "";
  return `<div class="habit tkrow ${esc3} ${x.virtual ? "virtual" : ""}"><span class="hi" style="background:${c.color}22;color:${c.color}">${x.kind === "event" ? "📅" : c.icon}</span>
    <button class="main" data-act="tk-edit" data-tid="${esc(x.id)}"><span class="title">${flag}${esc(x.title)}</span><span class="meta">${meta}</span></button>
    <span class="acts">${acts}</span>${subsHtml}${decide}</div>`;
}
const rows = (list, o) => list.map(x => row(x, o)).join("");

/* ---- 催办条：逾期 / 马上要做的 ---- */
function nudgeBar(){
  const n = tk.nudge(); if (!n.bar || !S.tk.loaded) return "";
  const od = tk.overdue(), nt = tk.nextTimed();
  const now = new Date(), mins = nt ? (() => { const [h, m] = nt.start_time.split(":").map(Number); return h * 60 + m - (now.getHours() * 60 + now.getMinutes()); })() : null;
  const soon = nt && mins <= 90;
  if (!od.length && !soon) return "";
  const oldest = od.length ? tk.overdueDays(od[0]) : 0, sev = oldest >= 4 ? "late3" : oldest >= 2 ? "late2" : od.length ? "late1" : "soon";
  return `<div class="nudge ${sev}" role="status">
    ${od.length ? `<div><b>${t("逾期 {n} 件", { n: od.length })}</b>${oldest >= 2 ? `<span class="muted"> · ${t("最久已拖 {d} 天", { d: oldest })}</span>` : ""}<button class="chip" data-act="tk-open-overdue">${t("去处理")}</button></div>` : ""}
    ${soon ? `<div><b>${mins <= 0 ? t("现在") : t("{m} 分钟后", { m: mins })}</b> ${nt.start_time} ${esc(nt.title)} <button class="chip" data-act="tk-edit" data-tid="${esc(nt.id)}">${t("打开")}</button><button class="iconbtn ok" data-act="tk-done" data-tid="${esc(nt.id)}" aria-label="${t("完成")}">✓</button></div>` : ""}</div>`;
}

/* ---- 今日三件大事 ---- */
function mitBlock(){
  if (!S.tk.loaded || S.pick) return "";
  const ids = tk.mitIds(), list = ids.map(tk.task).filter(Boolean), cand = tk.mitCandidates();
  if (!list.length && !cand.length) return "";
  const done = list.filter(x => x.status !== "open").length, all = list.length && done === list.length;
  return `<h2>${t("今日三件大事")} <button class="chip" data-act="tk-mit" style="font-family:var(--f-body);font-weight:400;vertical-align:middle">${list.length ? t("改") : t("选")}</button></h2>
  <div class="panel ${all ? "done" : ""}" style="padding:4px 10px">${list.length ? rows(list.filter(x => x.status === "open")) + list.filter(x => x.status !== "open").map(x => `<div class="habit done"><span class="hi" style="background:var(--sage-soft);color:var(--sage)">✓</span><span class="main"><span class="title">${esc(x.title)}</span></span><span></span></div>`).join("")
    : `<p class="muted" style="margin:10px 4px">${t("早上挑出最重要的 {n} 件，先做它们。", { n: tk.MIT_MAX })}</p>`}
    ${all ? `<p class="small" style="margin:8px 4px;color:var(--sage)">${t("三件大事都做完了，今天已经很踏实。")}</p>` : ""}</div>`;
}

/* ---- 今日任务（今天页和任务页“今天”共用）---- */
function capacityLine(list){
  const mins = list.reduce((s, x) => s + (+x.dur || 0), 0), cap = tk.nudge().capacityH * 60;
  if (!mins) return "";
  return `<p class="small ${mins > cap ? "late-txt" : "muted"}" style="margin:6px 2px 0">${t("今天排了约 {h} 小时（容量 {c} 小时）", { h: Math.round(mins / 6) / 10, c: tk.nudge().capacityH })}${mins > cap ? ` · ${t("排太满了，哪几件放到明天？")}` : ""}</p>`;
}
function evening(left){
  const n = tk.nudge(); if (!n.evening || S.pick || !left.length) return "";
  const now = new Date(), [h, m] = n.eveningAt.split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return "";
  return `<div class="nudge evening"><b>${t("收尾：今天还剩 {n} 件", { n: left.length })}</b><div class="btns" style="margin-top:6px"><button class="chip" data-act="tk-evening" data-to="tomorrow">${t("都放到明天")}</button><button class="chip" data-act="tk-evening" data-to="drop">${t("剩下的放弃")}</button></div></div>`;
}
function doneToday(day){
  const logs = tk.doneLogs().filter(l => l.day === day);
  if (!logs.length) return "";
  return `<details class="tk-done"><summary class="small muted">${t("今天已完成 {n} 件", { n: logs.length })}</summary>${logs.map(l => `<div class="habit done"><span class="hi" style="background:var(--sage-soft);color:var(--sage)">✓</span><span class="main"><span class="title">${esc(l.data.title || "")}</span></span><span class="acts"><button class="chip" data-act="tk-undo-log" data-lid="${esc(l.id)}">${t("撤销")}</button></span></div>`).join("")}</details>`;
}
function tasksBlock({ full = false } = {}){
  if (S.tk.error || !S.tk.loaded) return full ? gate() : "";
  const day = wb.viewDay(), past = day !== S.day;
  const inMit = new Set(past ? [] : tk.mitIds());   // 已经放进“今日三件大事”的，这里不再重复列出（收尾和容量仍然算它们）
  const hide = list => list.filter(x => !inMit.has(x.id));
  const odAll = past ? [] : tk.overdue(), todayAll = tk.onDay(day).filter(x => !x.virtual);
  const od = hide(odAll), today = hide(todayAll), week = past ? [] : hide(tk.periodTasks("week", day)), month = past ? [] : hide(tk.periodTasks("month", day)), inb = full && !past ? hide(tk.inbox()) : [];
  const left = [...odAll, ...todayAll];
  const body = (od.length ? `<h3 class="tk-h late-txt">${t("逾期")} ${od.length}</h3>${rows(od, { showDue: true })}` : "")
    + (today.length ? `${od.length ? `<h3 class="tk-h">${past ? t("当天") : t("今天")}</h3>` : ""}${rows(today)}` : "")
    + (week.length ? `<h3 class="tk-h">${t("本周要做")}</h3>${rows(week)}` : "") + (month.length ? `<h3 class="tk-h">${t("本月要做")}</h3>${rows(month)}` : "")
    + (inb.length ? `<h3 class="tk-h">${t("收件箱")} ${inb.length} <button class="chip" data-act="tk-tidy">${t("整理")}</button></h3>${rows(inb, { showDue: false })}` : "");
  return `<h2>${past ? t("当天的任务") : t("今日任务")} <button class="chip" data-act="tk-new" style="font-family:var(--f-body);font-weight:400;vertical-align:middle">＋ ${t("任务")}</button>${full ? "" : ` <button class="chip" data-tab="tasks" style="font-family:var(--f-body);font-weight:400;vertical-align:middle">${t("全部")}</button>`}</h2>
  ${full ? quickForm() : ""}
  <div class="panel" style="padding:4px 10px">${body || `<div class="empty">${past ? t("这天没有排任务。") : t("今天没有排任务。")}</div>`}</div>
  ${capacityLine(left)}${evening(left)}${doneToday(day)}`;
}
function quickForm(){
  return `<form id="tkQuickForm" class="quickadd" autocomplete="off"><input id="tkQuick" type="text" enterkeyhint="done" placeholder="${esc(t("快速添加：明天 9 点 给妈妈打电话 #家庭 !高"))}" aria-label="${t("快速添加任务")}"><button class="btn primary" type="submit">${t("添加")}</button></form>
  <p class="small muted" style="margin:4px 2px 8px">${t("日期、时间、#分类、!优先级、30分钟 都能写在一句话里；认不出日期的先进收件箱。")}</p>`;
}

/* ---- 计划：日 / 周 / 月 ---- */
const habitTimes = day => wb.forDay(day).flatMap(p => ((p.schedule && p.schedule.remind !== false && p.schedule.times) || []).map(tm => ({ time: tm, p })));
function dayNav(label, prev, next){
  return `<div class="daynav"><button class="iconbtn" data-act="${prev}" aria-label="${t("前一段")}">‹</button><b>${label}</b><button class="iconbtn" data-act="${next}" aria-label="${t("后一段")}">›</button><button class="chip" data-act="tk-today">${t("今天")}</button></div>`;
}
function dayPlan(day){
  const list = tk.onDay(day), timed = list.filter(x => x.start_time), untimed = list.filter(x => !x.start_time), ht = habitTimes(day);
  const od = day === S.day ? tk.overdue() : [];
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);   // 6:00–22:00
  const hourOf = tm => Math.min(22, Math.max(6, +tm.slice(0, 2)));
  const slot = h => { const a = timed.filter(x => hourOf(x.start_time) === h), b = ht.filter(x => hourOf(x.time) === h);
    return `<div class="hour"><span class="hl">${pad(h)}:00</span><div class="hb">${rows(a)}${b.map(x => `<div class="hhabit">${kindOf(x.p).icon} ${esc(x.p.name || t(kindOf(x.p).label))} <span class="muted">${x.time}</span></div>`).join("")}<button class="addhere" data-act="tk-new" data-day="${day}" data-time="${pad(h)}:00" aria-label="${t("在 {h}:00 添加", { h })}">＋</button></div></div>`; };
  return `${dayNav(`${day}　${wdLabel(day)}`, "tk-prev", "tk-next")}
  ${od.length ? `<div class="panel" style="padding:4px 10px"><h3 class="tk-h late-txt">${t("逾期")} ${od.length}</h3>${rows(od, { showDue: true })}</div>` : ""}
  <div class="panel" style="padding:4px 10px"><h3 class="tk-h">${t("全天 / 没定时间")}</h3>${untimed.length ? rows(untimed) : `<p class="muted small" style="margin:6px 2px">${t("没有。")}</p>`}</div>
  <div class="panel timeline" style="padding:4px 10px">${hours.map(slot).join("")}</div>`;
}
function weekPlan(day){
  const ws = weekStart(day), days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), pt = tk.periodTasks("week", day);
  return `${dayNav(`${shortDay(ws)} – ${shortDay(addDays(ws, 6))}`, "tk-prev", "tk-next")}
  ${pt.length ? `<div class="panel" style="padding:4px 10px"><h3 class="tk-h">${t("本周要做（不指定哪天）")}</h3>${rows(pt)}</div>` : ""}
  ${days.map(d => { const list = tk.onDay(d), n = list.length;
    return `<div class="panel wkday ${d === S.day ? "today" : ""}" style="padding:4px 10px"><h3 class="tk-h"><button class="linkbtn" data-act="tk-goto" data-day="${d}">${wdLabel(d)} ${shortDay(d)}</button> <span class="muted small">${n ? t("{n} 件", { n }) : t("空")}</span>${d === S.day ? ` <span class="pill">${t("今天")}</span>` : ""}</h3>${rows(list)}</div>`; }).join("")}`;
}
function monthPlan(day){
  const [y, m] = day.split("-").map(Number), first = `${y}-${pad(m)}-01`, dim = new Date(y, m, 0).getDate(), lead = (wdOf(first) + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<span class="cell pad"></span>`);
  for (let d = 1; d <= dim; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`, list = tk.onDay(date), cs = [...new Set(list.map(x => tk.catOf(x.cat).color))].slice(0, 3);
    const late = date < S.day && list.some(x => !x.virtual);
    cells.push(`<button class="cell ${date === S.day ? "today" : ""} ${date === day ? "sel" : ""}" data-act="tk-goto-month" data-day="${date}" aria-label="${date}${list.length ? `，${t("{n} 件", { n: list.length })}` : ""}"><span class="d">${d}</span>${list.length ? `<span class="dots">${cs.map(c => `<i style="background:${c}"></i>`).join("")}</span><span class="n ${late ? "late-txt" : ""}">${list.length}</span>` : ""}</button>`);
  }
  const pt = tk.periodTasks("month", day), list = tk.onDay(day);
  return `${dayNav(t("{y} 年 {m} 月", { y, m }), "tk-prev", "tk-next")}
  <div class="panel" style="padding:10px"><div class="month">${["一", "二", "三", "四", "五", "六", "日"].map(w => `<span class="wd">${t("周" + w).replace(/^周/, "")}</span>`).join("")}${cells.join("")}</div></div>
  <div class="panel" style="padding:4px 10px"><h3 class="tk-h">${day}　${wdLabel(day)}</h3>${list.length ? rows(list) : `<p class="muted small" style="margin:6px 2px">${t("这天没有任务。")}</p>`}<div class="btns" style="margin:6px 0"><button class="chip" data-act="tk-new" data-day="${day}">＋ ${t("加一件")}</button></div></div>
  ${pt.length ? `<div class="panel" style="padding:4px 10px"><h3 class="tk-h">${t("本月要做（不指定哪天）")}</h3>${rows(pt)}</div>` : ""}`;
}
function planView(){
  const r = ui().range, day = planDay();
  return `<div class="seg" role="group" aria-label="${t("范围")}" style="margin:0 0 10px">${[["day", "日"], ["week", "周"], ["month", "月"]].map(([k, l]) => `<button data-tkr="${k}" aria-pressed="${r === k}">${t(l)}</button>`).join("")}</div>
  ${r === "week" ? weekPlan(day) : r === "month" ? monthPlan(day) : dayPlan(day)}`;
}

/* ---- 清单：大类 → 小类 ---- */
function listView(){
  const f = ui(), q = f.q.trim().toLowerCase();
  const ok = x => (f.prio === "all" || (f.prio === "hi" ? x.prio === 3 : x.prio >= 1)) && (!q || `${x.title}${x.note}`.toLowerCase().includes(q));
  const mine = tk.open().filter(ok), cats = tk.cats();
  const groups = cats.map(c => {
    const own = mine.filter(x => x.cat === c.id); if (!own.length) return "";
    const subs = (c.subs || []).map(s => ({ s, list: own.filter(x => x.sub === s.id) })).filter(g => g.list.length), loose = own.filter(x => !x.sub || !(c.subs || []).some(s => s.id === x.sub));
    const sorted = list => [...list].sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1) || b.prio - a.prio);
    return `<details class="lib-group" ${c.id === "inbox" || q ? "open" : "open"}><summary><span style="color:${c.color}">${c.icon}</span> <b>${esc(tk.catName(c))}</b> <span class="small muted">${t("{n} 件", { n: own.length })}</span></summary>
      ${loose.length ? `<div class="panel" style="padding:4px 10px">${rows(sorted(loose), { showDue: true })}</div>` : ""}
      ${subs.map(g => `<h3 class="tk-h" style="margin:8px 4px 2px">${esc(tk.subName(c, g.s))} <span class="muted small">${g.list.length}</span></h3><div class="panel" style="padding:4px 10px">${rows(sorted(g.list), { showDue: true })}</div>`).join("")}</details>`;
  }).join("");
  return `<div class="lib-filters tk-filters"><label>${t("优先级")} <select id="tkPrio">${[["all", "全部"], ["any", "有优先级"], ["hi", "只看高"]].map(([v, l]) => `<option value="${v}" ${f.prio === v ? "selected" : ""}>${t(l)}</option>`).join("")}</select></label>
    <input type="search" id="tkQ" value="${esc(f.q)}" placeholder="${t("搜索任务")}" aria-label="${t("搜索任务")}"><button class="chip" data-act="tk-cats">${t("管理分类")}</button></div>
  ${groups || `<div class="empty">${t("没有未完成的任务。")}</div>`}`;
}

/* ---- 已完成 ---- */
function doneView(){
  const logs = tk.doneLogs(), dropped = S.tk.items.filter(x => x.status === "dropped").sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
  return `<h3 class="tk-h">${t("最近完成（12 周内）")}</h3>
  <div class="panel" style="padding:4px 10px">${logs.length ? logs.slice(0, 80).map(l => `<div class="habit done"><span class="hi" style="background:var(--sage-soft);color:var(--sage)">✓</span><span class="main"><span class="title">${esc(l.data.title || "")}</span><span class="meta">${l.day}${l.data.cat ? ` · ${esc(tk.catLabel({ cat: l.data.cat, sub: l.data.sub }))}` : ""}</span></span><span class="acts"><button class="chip" data-act="tk-undo-log" data-lid="${esc(l.id)}">${t("撤销")}</button></span></div>`).join("") : `<div class="empty">${t("还没有完成的任务。")}</div>`}</div>
  ${dropped.length ? `<h3 class="tk-h">${t("放弃的")}</h3><div class="panel" style="padding:4px 10px">${dropped.map(x => `<div class="habit done" data-swipe-del="dropped-task"><span class="hi">⌀</span><span class="main"><span class="title">${esc(x.title)}</span><span class="meta">${(x.done_at || "").slice(0, 10)}</span></span><span class="acts"><button class="chip" data-act="tk-reopen" data-tid="${esc(x.id)}">${t("重新打开")}</button><button class="chip swipe-src" data-act="tk-del" data-tid="${esc(x.id)}">${t("删除")}</button></span></div>`).join("")}</div>` : ""}`;
}

/* ---- 任务页 ---- */
function viewTasks(){
  const g = gate(); if (g) return `<h2>${t("任务")}</h2>${g}`;
  const seg = ui().seg;
  return `<div class="tk-head"><h2 style="margin:20px 0 8px">${t("任务")}</h2><button class="btn primary" data-act="tk-new">＋ ${t("新任务")}</button></div>
  <div class="seg" role="group" aria-label="${t("任务视图")}" style="margin-bottom:10px">${[["today", "今天"], ["plan", "计划"], ["list", "清单"], ["done", "已完成"]].map(([k, l]) => `<button data-tks="${k}" aria-pressed="${seg === k}">${t(l)}</button>`).join("")}</div>
  ${seg === "today" ? `${nudgeBar()}${mitBlock()}${tasksBlock({ full: true })}` : seg === "plan" ? planView() : seg === "list" ? listView() : doneView()}`;
}

/* ---- 表单 ---- */
const RECUR_FREQ = [["", "不重复"], ["day", "每天"], ["week", "每周"], ["month", "每月"], ["year", "每年"]];
const REMIND_OPTS = [[0, "准时"], [10, "提前 10 分钟"], [30, "提前 30 分钟"], [60, "提前 1 小时"], [1440, "提前 1 天"]];
function taskFields(){
  const cats = tk.cats();
  return [
    { k: "title", label: "做什么", type: "text", ph: "给张姐打电话" },
    { k: "kind", label: "类型", type: "seg", opts: [["task", "任务"], ["event", "事件（有开始时间，如拜访、聚会）"]] },
    { k: "cat", label: "大类", type: "seg", raw: true, opts: cats.map(c => [c.id, `${c.icon} ${tk.catName(c)}`]) },
    { k: "sub", label: "小类", type: "seg", raw: true, when: d => (tk.catOf(d.cat).subs || []).length > 0, optsFn: d => [["", t("不分")], ...(tk.catOf(d.cat).subs || []).map(s => [s.id, tk.subName(tk.catOf(d.cat), s)])] },
    { k: "period", label: "什么时候做", type: "seg", opts: PERIODS },
    { k: "due", label: "日期（本周 / 本月 / 本季度 / 本年度的，选那个周期里的任意一天）", type: "date" },
    { k: "start_time", label: "几点开始（可空）", type: "time", when: d => d.period === "day" },
    { k: "dur", label: "预估多少分钟（可空）", type: "num" },
    { k: "rfreq", label: "重复", type: "seg", opts: RECUR_FREQ, when: d => d.period === "day" },
    { k: "rperiod", label: "重复", type: "seg", opts: [["", "不重复"], ["1", "每个周期"]], when: d => d.period !== "day", hint: "如“每季度体检”：选“每个周期”，到期完成后自动排到下一个周期。" },
    { k: "revery", label: "每隔几个（天 / 周 / 月 / 年；1 = 每个）", type: "num", when: d => (d.period === "day" && d.rfreq) || (d.period !== "day" && d.rperiod) },
    { k: "rdays", label: "每周哪几天", type: "multi", opts: WEEKDAY.map((w, i) => [i, "周" + w]), when: d => d.period === "day" && d.rfreq === "week" && !d.rafter },
    { k: "rmday", label: "每月几号（空 = 同一天）", type: "num", when: d => d.period === "day" && d.rfreq === "month" && !d.rafter },
    { k: "rafter", label: "完成后再算下一次（洗车、换滤芯这类），不按固定日子", type: "check", when: d => d.period === "day" && d.rfreq },
    { k: "runtil", label: "重复到（可空）", type: "date", when: d => (d.period === "day" && d.rfreq) || (d.period !== "day" && d.rperiod) },
    { k: "prio", label: "优先级", type: "seg", opts: [["0", "无"], ["1", "低"], ["2", "中"], ["3", "高"]] },
    { k: "remind", label: "提醒（进手机日历，需要有开始时间或日期）", type: "multi", opts: REMIND_OPTS },
    { k: "nag", label: "要催：到点后 15 分钟、60 分钟再响一次", type: "check" },
    { k: "share", label: "家人能看到吗", type: "seg", when: () => !!S.family, opts: [["private", "只有我"], ["family", "家人可见"]] },
    { k: "subs", label: "小步骤（每行一条，可空）", type: "area", rows: 3 },
    { k: "note", label: "备注", type: "area", rows: 2 }
  ];
}
function draftOf(x, def = {}){
  const r = x && x.recur;
  return { id: x ? x.id : undefined, title: x ? x.title : def.title || "", kind: x ? x.kind : def.kind || "task", cat: x ? x.cat : def.cat || "inbox", sub: x ? x.sub : def.sub || "",
    period: x ? x.period : def.period || "day", due: x ? x.due || "" : def.due !== undefined ? def.due : S.day, start_time: x ? x.start_time || "" : def.start_time || "", dur: x ? x.dur : def.dur || null,
    rfreq: r && (x.period || "day") === "day" ? r.freq : "", rperiod: r && (x.period || "day") !== "day" ? "1" : "", revery: r ? r.every || 1 : 1, rdays: r && r.days ? r.days : [], rmday: r && r.mday ? r.mday : null, rafter: !!(r && r.after), runtil: r && r.until ? r.until : "",
    prio: String(x ? x.prio : def.prio || 0), remind: x ? x.remind || [] : def.remind || [], nag: x ? !!x.nag : false, share: x ? x.share : "private", subs: x ? (x.subtasks || []).map(s => s.t).join("\n") : "", note: x ? x.note : "" };
}
function fromDraft(d, old){
  const period = d.period || "day"; let due = d.due || null;
  if (period !== "day") due = periodEnd(period, due || S.day);
  let recur = null;
  if (period === "day" && d.rfreq) recur = { freq: d.rfreq, every: Math.max(1, +d.revery || 1), after: !!d.rafter, ...(d.rfreq === "week" && !d.rafter && (d.rdays || []).length ? { days: d.rdays.map(Number).sort() } : {}), ...(d.rfreq === "month" && !d.rafter && d.rmday ? { mday: +d.rmday } : {}), ...(d.runtil ? { until: d.runtil } : {}) };
  if (period !== "day" && d.rperiod) recur = { freq: "month", every: Math.max(1, +d.revery || 1), ...(d.runtil ? { until: d.runtil } : {}) };
  if (recur && !due) due = S.day;   // 重复必须有起点
  const old2 = (old && old.subtasks) || [], subs = String(d.subs || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => ({ t: s, done: !!(old2.find(o => o.t === s) || {}).done }));
  return { id: d.id, title: d.title, kind: d.kind, cat: d.cat, sub: d.sub, period, due, start_time: period === "day" ? d.start_time : "", dur: d.dur, recur, prio: +d.prio, remind: (d.remind || []).map(Number), nag: d.nag, share: d.share, subtasks: subs, note: d.note };
}
/** 新增 / 编辑任务的表单。小类的选项跟着大类变（字段的 optsFn 在画的时候取当前草稿） */
function openTaskForm(x, def){
  openForm(x ? "编辑任务" : "新任务", taskFields(), draftOf(x, def), async d => {
    const row = fromDraft(d, x); if (!row.title) { toast(t("请填标题")); return; }
    await tk.saveTask(row); closeSheet();
  }, x ? async () => { if (confirm(t("删除这条任务？"))) { await tk.remove(x.id); closeSheet(); } } : undefined);
}


/* ---- 整理收件箱：一条一条定大类和日期，存完自动接下一条 ---- */
let tidySeen = new Set();
function tidyNext(){
  const x = tk.inbox().find(i => !tidySeen.has(i.id));
  if (!x) { tidySeen = new Set(); closeSheet(); toast(t("收件箱整理完了")); return; }
  tidySeen.add(x.id);
  openForm("整理收件箱", taskFields(), { ...draftOf(x), due: x.due || S.day }, async d => {
    const row = fromDraft(d, x); if (!row.title) { toast(t("请填标题")); return; }
    await tk.saveTask(row); tidyNext();
  }, async () => { if (confirm(t("删除这条任务？"))) { await tk.remove(x.id); tidyNext(); } });
}
const startTidy = () => { tidySeen = new Set(); tidyNext(); };

/* ---- 今日三件大事：从候选里最多选 3 件 ---- */
function openMit(){
  const cand = tk.mitCandidates();
  openForm("今日三件大事", [{ k: "ids", label: "最多选 3 件", type: "multi", raw: true, opts: cand.map(x => [x.id, `${x.prio ? PRIO_MARK[x.prio] + " " : ""}${x.title}`]), hint: "候选：逾期的、今天到期的、高优先级的。选好就先做它们。" }],
    { ids: tk.mitIds() }, async f => { await tk.setMit((f.ids || []).slice(0, tk.MIT_MAX)); closeSheet(); });
}

/* ---- 任务分类管理：大类（名字、图标、颜色、小类每行一个）---- */
const CAT_COLORS = ["#7A6FB5", "#C8743A", "#5B8E5A", "#5F7F9B", "#B07A1A", "#3F8664", "#B44B60", "#8A948F"];
function openCats(){
  const cats = tk.cats().filter(c => c.id !== "inbox");
  openInfo("任务分类", `<p class="small muted">${t("大类 → 小类两层。改名、换图标颜色、增删小类都在“改”里；收件箱是固定的。")}</p>
  ${cats.map(c => `<div class="panel" style="margin-top:10px"><div class="row"><span style="color:${c.color};font-size:22px">${c.icon}</span><div class="v"><b>${esc(tk.catName(c))}</b><div class="small muted">${(c.subs || []).map(s => esc(tk.subName(c, s))).join(" · ") || t("没有小类")}</div></div><button class="chip" data-act="cat-edit" data-cid="${esc(c.id)}">${t("改")}</button></div></div>`).join("")}
  <div class="btns"><button class="btn primary" data-act="cat-add">＋ ${t("大类")}</button><button class="btn" data-act="cat-reset">${t("恢复默认")}</button></div>`);
}
function editCat(id){
  const all = tk.cats(), cur = all.find(c => c.id === id), blank = { id: "c" + newId().slice(-6), name: "", icon: "📌", color: CAT_COLORS[0], subs: [] }, c = cur || blank;
  openForm(cur ? "改大类" : "新大类", [
    { k: "name", label: "名字", type: "text", ph: "例如：教会事工" }, { k: "icon", label: "图标（一个表情）", type: "text", ph: "📌" },
    { k: "color", label: "颜色", type: "seg", raw: true, opts: CAT_COLORS.map(x => [x, "●"]) },
    { k: "subs", label: "小类（每行一个）", type: "area", rows: 4 }],
    { name: cur ? tk.catName(c) : "", icon: c.icon, color: c.color, subs: (c.subs || []).map(s => tk.subName(c, s)).join("\n") },
    async f => {
      const name = (f.name || "").trim(); if (!name) { toast(t("请填名字")); return; }
      const old = c.subs || [], subs = String(f.subs || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        .map(n => ({ id: (old.find(o => tk.subName(c, o) === n) || {}).id || "s" + newId().slice(-6), name: n }));
      const next = { ...c, name, icon: (f.icon || "📌").trim().slice(0, 4), color: f.color || c.color, subs };
      await tk.saveCats(cur ? all.map(x => (x.id === id ? next : x)) : [...all, next]);
      openCats();
    },
    cur ? async () => {
      const n = S.tk.items.filter(x => x.cat === id && x.status === "open").length;
      if (!confirm(n ? t("这个大类下还有 {n} 件未完成任务，删除后它们会回到收件箱。继续吗？", { n }) : t("删除这个大类？"))) return;
      for (const x of S.tk.items.filter(x => x.cat === id)) await tk.saveTask({ ...x, cat: "inbox", sub: "", subtasks: x.subtasks, remind: x.remind });
      await tk.saveCats(all.filter(x => x.id !== id)); openCats();
    } : undefined);
}
const resetCats = async () => { if (confirm(t("恢复成默认分类？自己加的大类会消失，用到它们的任务回到“收件箱”显示。"))) { await tk.saveCats(null); openCats(); } };

/* ---- 计划页翻页：日 ±1、周 ±7、月 ±1 个月 ---- */
function shiftPlan(dir){
  const r = ui().range, d = planDay();
  ui().day = r === "month" ? addMonths(d, dir, 1) : addDays(d, dir * (r === "week" ? 7 : 1));
}

export { viewTasks, tasksBlock, nudgeBar, mitBlock, quickForm, openTaskForm, startTidy, openMit, openCats, editCat, resetCats, shiftPlan, taskFields, draftOf, fromDraft, PERIODS };

/* 家人开给我看的任务 / 事件（只读）：share_mode = busy 的只显示“忙碌”和时间 */
import { memberName } from "./core/auth.js";
function familyTasks(day){
  const list = S.tk.fam.filter(x => (x.period || "day") === "day" && x.due === day).sort(tk.byTime);
  if (!list.length) return "";
  return `<h2>${t("家人的安排")}</h2><div class="panel">${list.map(x => `<div class="fam"><b>${esc(memberName(x.user_id) || t("家人"))}</b> <span class="small">${x.start_time ? x.start_time + " " : ""}${x.share_mode === "busy" ? t("忙碌") : esc(x.title)}</span></div>`).join("")}
  <p class="small muted" style="margin-top:8px">${t("只显示对方设为“家人可见”的任务和事件。")}</p></div>`;
}
export { familyTasks };
