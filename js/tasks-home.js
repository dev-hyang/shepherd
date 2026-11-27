import { viewSwitchHTML } from "./shared/ui-viewsw.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { barsSVG, hbarsHTML } from "./bars.js";
import { kpiCard } from "./kpi.js";
import * as tk from "./tk.js";
import { chipBtn, secHead } from "./ui.js";
import * as wb from "./wb.js";

/* ============ 任务首页（dashboard）============
   四张卡（今日进度、逾期、本周完成、收件箱）→ 完成趋势图（按天 / 按月切换）→ 待办按分类的分布 → 马上要做的几件。
   数字都来自已经读进内存的任务和完成记录，不额外查数据库。 */
const dayList = (n, to = S.day) => [...Array(n)].map((_, i) => wb.dayAdd(to, -(n - 1 - i)));
const doneByDay = () => { const m = new Map(); for (const l of tk.doneLogs()) m.set(l.day, (m.get(l.day) || 0) + 1); return m; };
const ui = () => (S.tkUi.chart ||= "day");

function cardsHTML(by){
  const day = S.day, doneN = by.get(day) || 0, od = tk.overdue(), todo = tk.onDay(day).filter(x => !x.virtual), total = doneN + od.length + todo.length;
  const week = dayList(7).reduce((s, d) => s + (by.get(d) || 0), 0), prev = dayList(7, wb.dayAdd(day, -7)).reduce((s, d) => s + (by.get(d) || 0), 0), inb = tk.inbox().length;
  return `<div class="kpis k4">
    ${kpiCard({ label: `☀ ${t("今日")}`, value: doneN, unit: `/${total}`, pct: total ? doneN / total * 100 : null, sub: total ? (doneN === total ? `✓ ${t("全部完成")}` : t("还剩 {n} 项", { n: total - doneN })) : t("今天没有排任务"), state: total && doneN === total ? "done" : "", target: "tks:today" })}
    ${kpiCard({ label: `⚠ ${t("逾期")}`, value: od.length, unit: t("件"), sub: od.length ? t("最久 {d} 天", { d: tk.overdueDays(od[0]) }) : `✓ ${t("没有逾期")}`, state: od.length ? "warn" : "done", target: "tks:today" })}
    ${kpiCard({ label: `✓ ${t("近 7 天完成")}`, value: week, unit: t("件"), sub: week === prev ? t("和前 7 天一样") : t("前 7 天 {n} 件", { n: prev }), target: "tks:list" })}
    ${kpiCard({ label: `📥 ${t("收件箱")}`, value: inb, unit: t("件"), sub: inb ? t("还没排日期，去清单整理") : `✓ ${t("已清空")}`, target: "tks:list" })}</div>`;
}
/** 完成趋势：近 14 天（按天）或近 6 个月（按月） */
function trendHTML(by){
  const mode = ui(), items = mode === "day"
    ? dayList(14).map(d => ({ label: String(+d.slice(8)), v: by.get(d) || 0, hi: d === S.day }))
    : [...Array(6)].map((_, i) => { const d = new Date(+S.day.slice(0, 4), +S.day.slice(5, 7) - 1 - (5 - i), 1), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return { label: `${d.getMonth() + 1}${t("月")}`, v: [...by].filter(([k]) => k.startsWith(key)).reduce((s, [, n]) => s + n, 0), hi: key === S.day.slice(0, 7) }; });
  const seg = viewSwitchHTML([["day", "按天"], ["month", "按月"]], mode, { attr: "tkc", label: "时间范围", t });
  return `${secHead(t("完成趋势"), seg)}<div class="panel">${barsSVG(items, { label: t("完成趋势"), unit: t("件") })}</div>`;
}
/** 待办按分类 */
function catsHTML(){
  const open = tk.open(), items = tk.cats().map(c => ({ label: `${c.icon} ${esc(tk.catName(c))}`, v: open.filter(x => x.cat === c.id).length, color: c.color })).filter(x => x.v).sort((a, b) => b.v - a.v);
  return `${secHead(t("待办分布"), chipBtn(t("清单"), 'data-tks="list"'))}<div class="panel">${items.length ? hbarsHTML(items) : `<div class="empty">${t("没有待办。")}</div>`}</div>`;
}
/** 马上要做的：今天（含逾期）之后最近的几件 */
function nextHTML(rows){
  const list = [...tk.overdue(), ...tk.onDay(S.day).filter(x => !x.virtual)].slice(0, 4);
  const more = list.length ? list : tk.open().filter(x => x.due && x.due > S.day).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, 4);
  return `${secHead(list.length ? t("今天要做") : t("接下来"), chipBtn(t("今日") + " ›", 'data-tks="today"'))}<div class="panel" style="padding:4px 10px">${more.length ? rows(more, { showDue: true }) : `<div class="empty">${t("今天没有排任务。")}</div>`}</div>`;
}
function homeView(rows){
  const by = doneByDay();
  return `${cardsHTML(by)}${trendHTML(by)}${catsHTML()}${nextHTML(rows)}`;
}

export { homeView };
