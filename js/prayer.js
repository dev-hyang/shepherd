import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { PRAYER_CATS } from "./data/kinds.js";
import { viewNotes } from "./notes.js";
import { fbar, pageHead } from "./ui.js";
import * as wb from "./wb.js";

/* ============ 祷告页：代祷 + 灵修笔记（两个子页）============
   代祷：清单 + 今天祷告了。清单永远只有自己看得到。"祷告了"记在条目上（次数、最近一次），"今天祷告了"记在祷告习惯上（家人可见时只看到做了没有）。
   灵修笔记：读书心得、读经领受、问题、感动（见 notes.js），读经祷告时遇到的问题和感动记在这里，日后查找、导出、打印。 */
function viewPrayer(){
  const v = S.prayerView === "notes" ? "notes" : "pray";
  const nOpen = S.wb.prayers.filter(p => p.status !== "answered").length, nNotes = S.nt && S.nt.loaded ? S.nt.mine.length : 0;
  const tabs = [["pray", t("代祷"), nOpen], ["notes", t("灵修笔记"), nNotes]];
  return `${pageHead(t("祷告与灵修"))}
  <div class="seg eq" role="group" aria-label="${t("祷告与灵修")}">${tabs.map(([k, l, n]) => `<button data-pview="${k}" aria-pressed="${v === k}">${l}${n ? ` <span class="cnt">${n}</span>` : ""}</button>`).join("")}</div>
  ${v === "notes" ? viewNotes() : viewPray()}`;
}
function viewPray(){
  const f = S.prayerFilter, day = S.day, q = (f.q || "").trim().toLowerCase();
  const all = S.wb.prayers, open = all.filter(p => p.status !== "answered"), answered = all.filter(p => p.status === "answered");
  const pp = wb.firstOfKind("prayer"), todayLogs = pp ? wb.logsFor(pp.id, day) : wb.logsOfKind("prayer", day);
  const list = (f.status === "answered" ? answered : f.status === "all" ? all : open).filter(p => (f.cat === "all" || p.category === f.cat) && (!q || `${p.text} ${p.answer || ""}`.toLowerCase().includes(q)));
  const days7 = [...Array(7)].map((_, i) => wb.dayAdd(day, -i)).filter(d => (pp ? wb.logsFor(pp.id, d) : wb.logsOfKind("prayer", d)).length).length;
  const ago = d => { if (!d) return t("还没为此祷告过"); const n = Math.round((new Date(day + "T12:00:00") - new Date(d + "T12:00:00")) / 864e5); return n <= 0 ? t("今天祷告过") : n === 1 ? t("昨天") : t("{n} 天前", { n }); };
  const row = p => `<div class="pray ${p.status === "answered" ? "done" : ""}">
    <button class="main" data-act="prayer-edit" data-id="${esc(p.id)}"><span class="title">${esc(p.text)}</span><span class="meta"><span class="pill cat">${t(PRAYER_CATS[p.category] || "")}</span> ${p.status === "answered" ? t("{d} 应允", { d: p.answered_on || "" }) + (p.answer ? ` · ${esc(p.answer)}` : "") : `${ago(p.last_prayed)}${p.times ? ` · ${t("共 {n} 次", { n: p.times })}` : ""}`}</span></button>
    <span class="acts">${p.status === "answered" ? `<button class="chip" data-act="prayer-reopen" data-id="${esc(p.id)}">${t("继续代祷")}</button>` : `<button class="chip" data-act="prayer-prayed" data-id="${esc(p.id)}">${p.last_prayed === day ? t("再记一次") : t("祷告了")}</button><button class="chip" data-act="prayer-answered" data-id="${esc(p.id)}">${t("应允了")}</button>`}</span></div>`;
  const opt = (attr, v, label, on, count) => ({ label, attrs: `${attr}="${v}"`, on, count });
  const bar = fbar({ id: "pray", q: { id: "prayQ", value: f.q || "", ph: "搜索代祷事项" }, add: { attrs: 'data-act="prayer-add"', label: "代祷" },
    groups: [
      { label: "状态", opts: [["open", "代祷中", open.length], ["answered", "已应允", answered.length], ["all", "全部", all.length]].map(([v, l, c]) => opt("data-pf-status", v, t(l), f.status === v, c)) },
      { label: "分类", opts: [opt("data-pf-cat", "all", t("全部"), f.cat === "all"), ...Object.entries(PRAYER_CATS).map(([k, l]) => opt("data-pf-cat", k, t(l), f.cat === k))] }] });
  return `<div class="stats compact" style="margin-top:12px">
    <div class="stat"><div class="v">${open.length}</div><div class="k">${t("代祷中")}</div></div>
    <div class="stat"><div class="v">${answered.length}</div><div class="k">${t("已应允")}</div></div>
    <div class="stat"><div class="v">${todayLogs.length}<small>${t("次")}</small></div><div class="k">${t("今天祷告")}</div></div>
    <div class="stat"><div class="v">${days7}<small>/7</small></div><div class="k">${t("近 7 天祷告的天数")}</div></div>
  </div>
  <div class="btns" style="margin-top:12px">${todayLogs.length ? `<button class="btn" data-act="pray-today-undo">${t("今天祷告了 ✓ · 撤销一次")}</button><button class="btn primary" data-act="pray-today">${t("再记一次")}</button>` : `<button class="btn primary" data-act="pray-today">${t("今天祷告了")}</button>`}</div>
  ${bar}
  <div class="panel" style="padding:4px 10px">${list.length ? list.map(row).join("") : `<div class="empty">${all.length ? t("这个筛选下没有事项。") : t("写下为谁、为什么祷告。应允了就记下来，成为日后的见证。")}</div>`}</div>
  <p class="small muted" style="margin-top:8px">${t("清单只有你自己看得到。“祷告了”记在事项上；“今天祷告了”记在祷告习惯上，开给家人看时也只有做了没有。")}</p>`;
}

export { viewPrayer };
