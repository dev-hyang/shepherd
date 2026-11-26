import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { kindOf } from "./data/kinds.js";
import * as hl from "./hl.js";
import { dueItems, labFlag } from "./health-lib.js";
import * as tk from "./tk.js";
import * as wb from "./wb.js";
import { kpiCard, leftText } from "./kpi.js";

/* ============ 今天页的 dashboard 卡片：习惯 · 任务 · 读经 · 祷告 · 健康 ============
   每张卡点一下进对应页面；健康卡只显示条数和日期，不显示任何数值（数值在健康页，默认遮挡）。 */
/** 健康卡：待办条数（复诊 / 年度体检 / 复查）+ 上次就诊日期 + 异常化验项数。看的是我自己 */
function healthCard(){
  if (!S.hl.loaded || !S.user) return kpiCard({ label: `♥ ${t("健康")}`, value: "–", sub: t("家人健康记录"), target: "tab:health" });
  const key = "u:" + S.user.id, data = hl.dataOf(key), due = dueItems({ data, today: S.day, kid: false });
  const last = [...data.visits].sort((a, b) => b.day.localeCompare(a.day))[0];
  const byKey = new Map(); for (const x of [...data.labs].sort((a, b) => a.day.localeCompare(b.day))) byKey.set(x.code || x.name, x);
  const abn = [...byKey.values()].filter(x => labFlag(x)).length, urgent = due.some(x => x.level === "due");
  const sub = [last ? t("上次就诊 {d}", { d: last.day.slice(5).replace("-", "/") }) : t("还没有就诊记录"), abn ? t("异常化验 {n} 项", { n: abn }) : ""].filter(Boolean).join(" · ");
  return kpiCard({ label: `♥ ${t("健康")}`, value: due.length ? due.length : "✓", unit: due.length ? t("项待办") : "", sub, state: urgent ? "warn" : due.length ? "" : "done", target: "tab:health" });
}
function kpisHTML(day, list){
  const past = day !== S.day, cards = [];
  // 习惯（不含读经，读经单独一张）
  const hab = list.filter(p => p.kind !== "scripture"), habLeft = hab.filter(p => !wb.statusOf(p, day).done);
  cards.push(hab.length ? kpiCard({ label: `✦ ${t("习惯")}`, value: hab.length - habLeft.length, unit: `/${hab.length}`, pct: (hab.length - habLeft.length) / hab.length * 100,
    sub: habLeft.length ? `${t("还剩")} ${leftText(habLeft.map(p => p.name || t(kindOf(p).label)))}` : `✓ ${t("全部完成")}`, state: habLeft.length ? "" : "done", target: "tab:habits" })
    : kpiCard({ label: `✦ ${t("习惯")}`, value: "–", sub: t("今天没有安排"), target: "tab:habits" }));
  // 任务：今天已完成 + 还没做的（逾期 + 当天）
  if (S.tk && S.tk.loaded && !S.tk.error) {
    const doneN = tk.doneLogs().filter(l => l.day === day).length, od = past ? [] : tk.overdue(), todo = tk.onDay(day).filter(x => !x.virtual), left = [...od, ...todo], total = doneN + left.length;
    cards.push(total ? kpiCard({ label: `✓ ${t("任务")}`, value: doneN, unit: `/${total}`, pct: doneN / total * 100,
      sub: od.length ? `${t("逾期 {n} 件", { n: od.length })} · ${t("共剩 {n} 项", { n: left.length })}` : left.length ? `${t("还剩")} ${leftText(left.map(x => x.title))}` : `✓ ${t("全部完成")}`,
      state: od.length ? "warn" : left.length ? "" : "done", target: "tab:tasks" })
      : kpiCard({ label: `✓ ${t("任务")}`, value: "–", sub: t("今天没有排任务"), target: "tab:tasks" }));
  }
  // 读经：读了没有 + 连续天数
  const tp = wb.todayPassage(), rl = wb.readingLog(day) || wb.logsOfKind("scripture", day)[0], sp = wb.firstOfKind("scripture"), sk = sp ? wb.streak(sp) : 0;
  cards.push(kpiCard({ label: `📖 ${t("读经")}`, value: rl ? "✓" : tp || sp ? t("未读") : "–", pct: tp || sp || rl ? (rl ? 100 : 0) : null,
    sub: rl ? (sk ? t("连续 {n} 天", { n: sk }) : t("今天读了")) : tp ? `${t("今天")}：${esc(tp.item.label)}` : t("选个读经计划"), state: rl ? "done" : "", target: "tab:prayer:read" }));
  // 祷告：今天几次（有目标就带进度）+ 代祷中几项
  const pp = wb.firstOfKind("prayer"), pst = pp ? wb.statusOf(pp, day) : null, cnt = pp ? pst.count : wb.logsOfKind("prayer", day).length, goal = pp && pp.target && pp.target.count ? pp.target.count : 0;
  cards.push(kpiCard({ label: `🕊 ${t("祷告")}`, value: cnt, unit: goal ? `/${goal}` : t("次"), pct: goal ? Math.min(100, cnt / goal * 100) : null,
    sub: t("代祷中 {n} 项", { n: S.wb.prayers.filter(x => x.status !== "answered").length }), state: goal && cnt >= goal ? "done" : "", target: "tab:prayer:pray" }));
  cards.push(healthCard());
  return `<div class="kpis k5">${cards.join("")}</div>`;
}


export { kpisHTML };
