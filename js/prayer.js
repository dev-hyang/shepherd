import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { PRAYER_CATS } from "./data/kinds.js";
import * as pg from "./pager.js";
import { fab, fbar, pageHead, routeNav } from "./ui.js";
import { kpiCard } from "./kpi.js";
import { readingHTML, readingView } from "./reading.js";
import { noteHeading } from "./notes-lib.js";
import { kindLabel, viewNotes } from "./notes.js";
import * as wb from "./wb.js";

/* ============ 祷告页：首页（三张卡）→ 读经 · 灵修 · 祷告 ============
   首页是 dashboard：读经卡（今天这段、连续天数）、灵修卡（笔记条数、最近一条）、祷告卡（今天几次、代祷中几项），点卡片进对应子页，目录按钮也能直接跳。
   读经：今天这一段 + 连续 / 本周 / 计划进度（js/reading.js）。灵修：读书心得、读经领受、问题、感动（js/notes.js）。
   祷告：代祷清单 + 今天祷告了。清单永远只有自己看得到；"祷告了"记在条目上（次数、最近一次），"今天祷告了"记在祷告习惯上（家人可见时只看到做了没有）。 */
const VIEWS = [["home", "首页"], ["read", "读经"], ["notes", "灵修"], ["pray", "祷告"]];
function viewPrayer(){
  const v = VIEWS.some(x => x[0] === S.prayerView) ? S.prayerView : "home", name = k => t(VIEWS.find(x => x[0] === k)[1]);
  const parts = v === "home" ? [{ label: t("祷告") }] : [{ label: t("祷告"), attrs: 'data-pview="home"' }, { label: name(v) }];
  const body = v === "read" ? readingView() : v === "notes" ? viewNotes() + (S.ntUi.scope === "mine" ? fab('data-act="note-add"', t("新增笔记")) : "") : v === "pray" ? viewPray() + fab('data-act="prayer-add"', t("新增代祷")) : homeView();
  return `${routeNav(parts)}${body}`;
}
/** 首页三张卡 */
function homeView(){
  const day = S.day, tp = wb.todayPassage(), rl = wb.readingLog(day) || wb.logsOfKind("scripture", day)[0], sp = wb.firstOfKind("scripture"), sk = sp ? wb.streak(sp) : 0;
  const read = kpiCard({ label: `📖 ${t("读经")}`, value: rl ? "✓" : tp || sp ? t("未读") : "–", pct: tp || sp || rl ? (rl ? 100 : 0) : null,
    sub: rl ? (sk ? t("连续 {n} 天", { n: sk }) : t("今天读了")) : tp ? `${t("今天")}：${esc(tp.item.label)}` : t("选个读经计划"), state: rl ? "done" : "", target: "pview:read" });
  const st = S.nt && S.nt.loaded ? S.nt.stats : null, last = st && st.latest;
  const note = kpiCard({ label: `✎ ${t("灵修")}`, value: st ? st.mine || 0 : "–", unit: st ? t("条") : "", sub: last ? `${t("最近：{h}", { h: esc(noteHeading(last, kindLabel)) })}` : t("读书、读经、祷告时的心得和感动"), target: "pview:notes" });
  const pp = wb.firstOfKind("prayer"), pst = pp ? wb.statusOf(pp, day) : null, cnt = pp ? pst.count : wb.logsOfKind("prayer", day).length, goal = pp && pp.target && pp.target.count ? pp.target.count : 0;
  const pray = kpiCard({ label: `🕊 ${t("祷告")}`, value: cnt, unit: goal ? `/${goal}` : t("次"), pct: goal ? Math.min(100, cnt / goal * 100) : null,
    sub: t("代祷中 {n} 项", { n: S.wb.prayers.filter(x => x.status !== "answered").length }), state: goal && cnt >= goal ? "done" : "", target: "pview:pray" });
  return `<div class="kpis k3">${read}${note}${pray}</div><div style="margin-top:12px">${readingHTML()}</div>`;
}
function viewPray(){
  const f = S.prayerFilter, day = S.day, q = (f.q || "").trim().toLowerCase();
  const all = S.wb.prayers, open = all.filter(p => p.status !== "answered"), answered = all.filter(p => p.status === "answered");
  const pp = wb.firstOfKind("prayer"), todayLogs = pp ? wb.logsFor(pp.id, day) : wb.logsOfKind("prayer", day);
  const list = (f.status === "answered" ? answered : f.status === "all" ? all : open).filter(p => (f.cat === "all" || p.category === f.cat) && (!q || `${p.text} ${p.answer || ""}`.toLowerCase().includes(q)));
  const days7 = [...Array(7)].map((_, i) => wb.dayAdd(day, -i)).filter(d => (pp ? wb.logsFor(pp.id, d) : wb.logsOfKind("prayer", d)).length).length;
  const ago = d => { if (!d) return t("还没为此祷告过"); const n = Math.round((new Date(day + "T12:00:00") - new Date(d + "T12:00:00")) / 864e5); return n <= 0 ? t("今天祷告过") : n === 1 ? t("昨天") : t("{n} 天前", { n }); };
  const row = p => `<div class="pray ${p.status === "answered" ? "done" : ""}">
    <button class="main" data-act="prayer-edit" data-id="${esc(p.id)}"><span class="title">${esc(p.text)}</span><span class="meta"><span class="ui-badge" data-tone="accent">${t(PRAYER_CATS[p.category] || "")}</span> ${p.status === "answered" ? t("{d} 应允", { d: p.answered_on || "" }) + (p.answer ? ` · ${esc(p.answer)}` : "") : `${ago(p.last_prayed)}${p.times ? ` · ${t("共 {n} 次", { n: p.times })}` : ""}`}</span></button>
    <span class="acts">${p.status === "answered" ? `<button class="chip" data-act="prayer-reopen" data-id="${esc(p.id)}">${t("继续代祷")}</button>` : `<button class="chip" data-act="prayer-prayed" data-id="${esc(p.id)}">${p.last_prayed === day ? t("再记一次") : t("祷告了")}</button><button class="chip" data-act="prayer-answered" data-id="${esc(p.id)}">${t("应允了")}</button>`}</span></div>`;
  const opt = (attr, v, label, on, count) => ({ label, attrs: `${attr}="${v}"`, on, count });
  const bar = fbar({ id: "pray", title: t("代祷"), q: { id: "prayQ", value: f.q || "", ph: "搜索代祷事项" },
    groups: [
      { label: "状态", opts: [["open", "代祷中", open.length], ["answered", "已应允", answered.length], ["all", "全部", all.length]].map(([v, l, c]) => opt("data-pf-status", v, t(l), f.status === v, c)) },
      { label: "分类", opts: [opt("data-pf-cat", "all", t("全部"), f.cat === "all"), ...Object.entries(PRAYER_CATS).map(([k, l]) => opt("data-pf-cat", k, t(l), f.cat === k))] }] });
  return `<div class="stats compact" style="margin-top:12px">
    <div class="stat"><div class="v">${open.length}</div><div class="k">${t("代祷中")}</div></div>
    <div class="stat"><div class="v">${answered.length}</div><div class="k">${t("已应允")}</div></div>
    <div class="stat"><div class="v">${todayLogs.length}<small>${t("次")}</small></div><div class="k">${t("今天祷告")}</div></div>
    <div class="stat"><div class="v">${days7}<small>/7</small></div><div class="k">${t("近 7 天祷告的天数")}</div></div>
  </div>
  <div class="ui-acts btns" style="margin-top:12px">${todayLogs.length ? `<button class="ui-btn" data-tone="ghost" data-act="pray-today-undo">${t("今天祷告了 ✓ · 撤销一次")}</button><button class="ui-btn" data-tone="primary" data-act="pray-today">${t("再记一次")}</button>` : `<button class="ui-btn" data-tone="primary" data-act="pray-today">${t("今天祷告了")}</button>`}</div>
  ${bar}
  <div class="panel" style="padding:4px 10px">${list.length ? pg.page("prayers", list).map(row).join("") : `<div class="empty">${all.length ? t("这个筛选下没有事项。") : t("写下为谁、为什么祷告。应允了就记下来，成为日后的见证。")}</div>`}</div>
  ${pg.moreBtn("prayers", list.length)}
  <p class="small muted" style="margin-top:8px">${t("清单只有你自己看得到。“祷告了”记在事项上；“今天祷告了”记在祷告习惯上，开给家人看时也只有做了没有。")}</p>`;
}

export { viewPrayer };
