import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm, toast } from "./core/util.js";
import * as tk from "./tk.js";
import { WEEKDAY, kindOf } from "./data/kinds.js";
import { PRESETS } from "./hero-presets-lib.js";
import { draftToLog, filterLogs, groupByDay, logLine, logToDraft, modeFor, nameFor, recFields, recProblem, toTs } from "./records-lib.js";
import * as pg from "./pager.js";
import { closeSheet, openForm } from "./sheet.js";
import { viewSwitchHTML } from "./shared/ui-viewsw.js";
import { fab, fbar, secHead } from "./ui.js";
import { render } from "./views.js";
import * as wb from "./wb.js";

/* ============ 回顾 → 记录：每条打卡一行 ============
   所有习惯（读经、祷告、锻炼、用药……）的打卡记录放在一起：能按习惯 / 时间范围筛选、搜索，
   表格和时间线两种看法；每条能改日期、时间和内容，能删；右下角 ＋（补记）可以指定哪天几点（距上次的计时也跟着准）。
   只显示自己的记录（家人的只在今天页「家人」里看完成情况）。逻辑在 records-lib.js。 */
const RANGES = [[7, "近 7 天"], [30, "近 30 天"], [0, "全部"]];
const ui = () => (S.rec ||= { pid: "all", days: 30, view: "table", q: "" });
const isTask = l => l.kind === "task";   // 完成任务时记的一条（data.title、data.cat）
const pOf = l => (l.practice_id ? wb.practice(l.practice_id) : null);
const lineOf = l => isTask(l) ? [t("完成任务"), (l.data || {}).cat ? tk.catName(tk.catOf(l.data.cat)) : "", (l.data || {}).minutes ? t("{m} 分钟", { m: l.data.minutes }) : ""].filter(Boolean).join(" · ") : logLine(l, pOf(l), t);
const iconOf = l => { if (isTask(l)) return tk.catOf((l.data || {}).cat).icon; const p = pOf(l), pr = p && p.meta && PRESETS[p.meta.preset]; return pr ? pr.icon : kindOf(p || { kind: l.kind }).icon; };   // 陪伴 / 休息用预设自己的图标
const rowsAll = () => filterLogs(S.wb.logs, { pid: ui().pid, days: ui().days, q: ui().q, today: S.day, line: lineOf });

function filterBar(){
  const u = ui(), act = (k, v) => `data-act="rec-f" data-k="${k}" data-v="${esc(v)}"`;
  const ps = S.wb.practices.filter(p => !p.archived);
  return fbar({ id: "rec", title: t("记录"), q: { id: "recQ", value: u.q, ph: "搜索备注、内容" }, groups: [
    { label: "习惯", opts: [{ label: t("全部"), attrs: act("pid", "all"), on: u.pid === "all" }, ...ps.map(p => ({ label: `${kindOf(p).icon} ${esc(p.name || t(kindOf(p).label))}`, attrs: act("pid", p.id), on: u.pid === p.id }))] },
    { label: "范围", opts: RANGES.map(([d, l]) => ({ label: t(l), attrs: act("days", d), on: u.days === d })) }] });
}
const viewSwitch = () => viewSwitchHTML([["table", "表格"], ["line", "时间线"]], ui().view, { attrs: 'data-act="rec-f" data-k="view"', label: "显示方式", t });
/** 每行的「编辑 / 删除」：习惯记录开编辑表单、删掉；任务完成记录打开任务、撤销完成（任务重新打开） */
const editBtn = l => (isTask(l) ? (tk.task((l.data || {}).task_id) ? `<button class="chip" data-act="tk-edit" data-tid="${esc(l.data.task_id)}" aria-label="${esc(t("编辑"))}">${t("编辑")}</button>` : "") : `<button class="chip" data-act="rec-edit" data-id="${esc(l.id)}" aria-label="${esc(t("编辑"))}">${t("编辑")}</button>`)
  + (isTask(l) ? `<button class="chip" data-act="tk-undo-log" data-lid="${esc(l.id)}" aria-label="${esc(t("撤销完成"))}">${t("撤销完成")}</button>` : `<button class="chip" data-act="rec-del" data-id="${esc(l.id)}" aria-label="${esc(t("删除"))}">${t("删除")}</button>`);
const wd = day => t("周{d}", { d: t(WEEKDAY[new Date(toTs(day, "")).getDay()]) });
const nameOf = l => isTask(l) ? ((l.data || {}).title || t("任务")) : nameFor(l, pOf(l), t);
const who = l => `${iconOf(l)} ${esc(nameOf(l))}`;

function tableHTML(list){
  return `<table class="rectable"><thead><tr><th>${t("时间")}</th><th>${t("事项")}</th><th>${t("记录")}</th><th></th></tr></thead><tbody>${list.map(l =>
    `<tr><td class="rt-when"><b>${esc(l.day.slice(5).replace("-", "/"))}</b> <span class="muted">${esc(wd(l.day))} ${hm(l.ts)}</span></td><td class="rt-who">${who(l)}</td><td class="rt-line">${esc(lineOf(l))}</td><td class="rt-act">${editBtn(l)}</td></tr>`).join("")}</tbody></table>`;
}
function lineHTML(list, { noDay = false } = {}){
  return groupByDay(list).map(g => `${noDay ? "" : `<h3 class="recday">${esc(g.day.slice(5).replace("-", "/"))} <small class="muted">${esc(wd(g.day))}${g.day === S.day ? ` · ${t("今天")}` : ""}</small></h3>`}
    <ol class="recline">${g.items.map(l => `<li><span class="rl-time num">${hm(l.ts)}</span><span class="rl-dot" aria-hidden="true">${iconOf(l)}</span><div class="rl-body"><b>${esc(nameOf(l))}</b><div class="small muted">${esc(lineOf(l))}</div></div>${editBtn(l)}</li>`).join("")}</ol>`).join("");
}
function viewRecords(){
  const all = rowsAll(), list = pg.page("rec", all);
  const body = !all.length ? `<div class="empty">${S.wb.logs.length ? t("没有符合的记录。") : t("还没有打卡记录。")}</div>` : ui().view === "line" ? lineHTML(list) : tableHTML(list);
  return `${filterBar()}<div class="hl-listbar"><p class="small muted hl-count">${t("共 {n} 条", { n: all.length })} · ${t("只显示最近 12 周的自己的记录")}</p>${viewSwitch()}</div>${body}${pg.moreBtn("rec", all.length)}${fab('data-act="rec-add"', t("补记"))}`;
}

/** 今天页底部：这一天做过的所有事（习惯、读经、祷告、任务完成……）放在一起，表格 / 时间线两种看法，每行能改、能删 */
function todayRecordsHTML(day){
  const list = S.wb.logs.filter(l => l.day === day).sort((a, b) => b.ts - a.ts), u = ui(), view = u.tview || "line";
  const sw = viewSwitchHTML([["table", "表格"], ["line", "时间线"]], view, { attrs: 'data-act="rec-tv"', label: "显示方式", t });
  const body = !list.length ? `<div class="empty">${t(day === S.day ? "今天还没有记录。" : "这天没有记录。")}</div>` : view === "table" ? tableHTML(list) : lineHTML(list, { noDay: true });
  return `${secHead(t(day === S.day ? "今天的记录" : "当天的记录"), "", list.length ? t("{n} 条", { n: list.length }) : "")}<div class="ui-vsw-bar">${sw}</div>${body}`;
}

/* ---- 编辑 / 补记 ---- */
function openRec(log, pid){
  const p = log ? pOf(log) : wb.practice(pid), mode = log ? modeFor(log, p) : modeFor({ kind: p.kind }, p);
  const isNew = !log, base = log ? logToDraft(log) : { ...logToDraft({ day: S.day, ts: Date.now(), data: { taken: true } }) };
  const title = `${isNew ? "补记" : "编辑"}：${nameFor(log || { kind: p.kind }, p, t)}`;
  openForm(title, recFields(mode, { rest: !!(p && p.meta && p.meta.preset === "rest") }), base, async f => {
    const bad = recProblem(f, mode); if (bad) { toast(t(bad)); return; }
    const out = draftToLog(f, mode, log ? log.data : {});
    if (isNew) { const d = await wb.addLog(p.kind, p.id, out.data, out.day, out.ts); if (d && mode === "slots") await wb.adjustStock(p, false, !!out.data.taken); toast(t("已补记")); }
    else { await wb.editLog(log.id, out); toast(t("已保存")); }
    closeSheet();
  }, isNew ? null : async () => {
    if (!confirm(t("删除这条记录？删掉后不能恢复。"))) return;
    await wb.deleteLogWithStock(log.id); toast(t("已删除")); closeSheet();
  });
}
// 补记先选是哪项习惯（只有一项就直接开表单；指定了 pid 也直接开）
function pickPractice(pid){
  const ps = S.wb.practices.filter(p => !p.archived);
  if (pid && wb.practice(pid)) return openRec(null, pid);
  if (ps.length === 1) return openRec(null, ps[0].id);
  if (!ps.length) { toast(t("还没有习惯，先去添加一项")); return; }
  openForm("补记：选哪一项", [{ k: "pid", label: "习惯", type: "seg", raw: true, opts: ps.map(p => [p.id, `${kindOf(p).icon} ${p.name || t(kindOf(p).label)}`]) }], { pid: ui().pid !== "all" ? ui().pid : ps[0].id },
    async f => { closeSheet(); if (f.pid) setTimeout(() => openRec(null, f.pid), 0); });
}

/** 点击分发（events.js 把 rec- 开头的 data-act 交给这里） */
async function recAct(act, d){
  switch (act) {
    case "rec-f": { const u = ui(), v = d.k === "days" ? +d.v : d.v; u[d.k] = v; pg.reset("rec"); render(); break; }
    case "rec-new": pickPractice(d.pid); break;
    case "rec-add": pickPractice(ui().pid !== "all" ? ui().pid : ""); break;
    case "rec-open": { ui().pid = d.pid || "all"; S.tab = "records"; S.fpop = null; pg.reset("rec"); render(); window.scrollTo(0, 0); break; }
    case "rec-tv": ui().tview = d.v; render(); break;
    case "rec-del": { if (!confirm(t("删除这条记录？删掉后不能恢复。"))) break; await wb.deleteLogWithStock(d.id); toast(t("已删除")); render(); break; }
    case "rec-edit": { const l = S.wb.logs.find(x => x.id === d.id); if (l) openRec(l); break; }
  }
}
const setQ = v => { ui().q = v; pg.reset("rec"); };

export { viewRecords, recAct, setQ, todayRecordsHTML };
