import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm, toast } from "./core/util.js";
import { WEEKDAY, kindOf } from "./data/kinds.js";
import { PRESETS } from "./hero-presets-lib.js";
import { draftToLog, filterLogs, groupByDay, logLine, logToDraft, modeFor, nameFor, recFields, recProblem, toTs } from "./records-lib.js";
import * as pg from "./pager.js";
import { closeSheet, openForm } from "./sheet.js";
import { viewSwitchHTML } from "./shared/ui-viewsw.js";
import { fab, fbar } from "./ui.js";
import { render } from "./views.js";
import * as wb from "./wb.js";

/* ============ 回顾 → 记录：每条打卡一行 ============
   所有习惯（读经、祷告、锻炼、用药……）的打卡记录放在一起：能按习惯 / 时间范围筛选、搜索，
   表格和时间线两种看法；每条能改日期、时间和内容，能删；右下角 ＋（补记）可以指定哪天几点（距上次的计时也跟着准）。
   只显示自己的记录（家人的只在今天页「家人」里看完成情况）。逻辑在 records-lib.js。 */
const RANGES = [[7, "近 7 天"], [30, "近 30 天"], [0, "全部"]];
const ui = () => (S.rec ||= { pid: "all", days: 30, view: "table", q: "" });
const pOf = l => (l.practice_id ? wb.practice(l.practice_id) : null);
const lineOf = l => logLine(l, pOf(l), t);
const iconOf = l => { const p = pOf(l), pr = p && p.meta && PRESETS[p.meta.preset]; return pr ? pr.icon : kindOf(p || { kind: l.kind }).icon; };   // 陪伴 / 休息用预设自己的图标
const rowsAll = () => filterLogs(S.wb.logs, { pid: ui().pid, days: ui().days, q: ui().q, today: S.day, line: lineOf });

function filterBar(){
  const u = ui(), act = (k, v) => `data-act="rec-f" data-k="${k}" data-v="${esc(v)}"`;
  const ps = S.wb.practices.filter(p => !p.archived);
  return fbar({ id: "rec", title: t("记录"), q: { id: "recQ", value: u.q, ph: "搜索备注、内容" }, groups: [
    { label: "习惯", opts: [{ label: t("全部"), attrs: act("pid", "all"), on: u.pid === "all" }, ...ps.map(p => ({ label: `${kindOf(p).icon} ${esc(p.name || t(kindOf(p).label))}`, attrs: act("pid", p.id), on: u.pid === p.id }))] },
    { label: "范围", opts: RANGES.map(([d, l]) => ({ label: t(l), attrs: act("days", d), on: u.days === d })) }] });
}
const viewSwitch = () => viewSwitchHTML([["table", "表格"], ["line", "时间线"]], ui().view, { attrs: 'data-act="rec-f" data-k="view"', label: "显示方式", t });
const editBtn = l => `<button class="chip" data-act="rec-edit" data-id="${esc(l.id)}" aria-label="${esc(t("编辑"))}">${t("编辑")}</button>`;
const wd = day => t("周{d}", { d: t(WEEKDAY[new Date(toTs(day, "")).getDay()]) });
const who = l => `${iconOf(l)} ${esc(nameFor(l, pOf(l), t))}`;

function tableHTML(list){
  return `<table class="rectable"><thead><tr><th>${t("时间")}</th><th>${t("习惯")}</th><th>${t("记录")}</th><th></th></tr></thead><tbody>${list.map(l =>
    `<tr><td class="rt-when"><b>${esc(l.day.slice(5).replace("-", "/"))}</b> <span class="muted">${esc(wd(l.day))} ${hm(l.ts)}</span></td><td class="rt-who">${who(l)}</td><td class="rt-line">${esc(lineOf(l))}</td><td class="rt-act">${editBtn(l)}</td></tr>`).join("")}</tbody></table>`;
}
function lineHTML(list){
  return groupByDay(list).map(g => `<h3 class="recday">${esc(g.day.slice(5).replace("-", "/"))} <small class="muted">${esc(wd(g.day))}${g.day === S.day ? ` · ${t("今天")}` : ""}</small></h3>
    <ol class="recline">${g.items.map(l => `<li><span class="rl-time num">${hm(l.ts)}</span><span class="rl-dot" aria-hidden="true">${iconOf(l)}</span><div class="rl-body"><b>${esc(nameFor(l, pOf(l), t))}</b><div class="small muted">${esc(lineOf(l))}</div></div>${editBtn(l)}</li>`).join("")}</ol>`).join("");
}
function viewRecords(){
  const all = rowsAll(), list = pg.page("rec", all);
  const body = !all.length ? `<div class="empty">${S.wb.logs.length ? t("没有符合的记录。") : t("还没有打卡记录。")}</div>` : ui().view === "line" ? lineHTML(list) : tableHTML(list);
  return `${filterBar()}<div class="hl-listbar"><p class="small muted hl-count">${t("共 {n} 条", { n: all.length })} · ${t("只显示最近 12 周的自己的记录")}</p>${viewSwitch()}</div>${body}${pg.moreBtn("rec", all.length)}${fab('data-act="rec-add"', t("补记"))}`;
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
    case "rec-edit": { const l = S.wb.logs.find(x => x.id === d.id); if (l) openRec(l); break; }
  }
}
const setQ = v => { ui().q = v; pg.reset("rec"); };

export { viewRecords, recAct, setQ };
