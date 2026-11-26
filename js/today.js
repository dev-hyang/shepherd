import { isOwner, myName } from "./core/auth.js";
import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm } from "./core/util.js";
import { KINDS, RATINGS, WEEKDAY, kindOf, modeOf } from "./data/kinds.js";
import * as tk from "./tk.js";
import * as wb from "./wb.js";
import { kindLabel, otdHTML } from "./notes.js";
import { noteHeading } from "./notes-lib.js";
import { askEntryHTML } from "./ask.js";
import { heroTrackHTML } from "./med-hero.js";
import { howText } from "./med-hero-lib.js";
import { releaseBadgeHTML } from "./releases-ui.js";
import { chipBtn, secHead } from "./ui.js";
import { kpiCard, leftText } from "./kpi.js";
import { readingHTML } from "./reading.js";
import { familyTasks, mitBlock, nudgeBar, tasksBlock } from "./tasks.js";

/* ============ 今天页：读经 → 今日习惯 → 家人 ============ */
/* ============ 今天页的版式 ============
   自上而下：① 大卡片（问候 + 日期，补记时在这里切换）② 紧急提醒（逾期 / 马上要做）③ 四张统计卡（习惯、任务、读经、祷告：完成几项、还剩什么，点一下滚到对应区块）④ 内容区。
   内容区手机一栏，按“一天怎么过”排：读经 → 三件大事 + 今日任务 → 今日习惯 → 灵修笔记 → 家人；
   电脑（≥900px）分两栏：左（略宽）放“今日习惯 + 家人”——习惯是每天最常点的，条目多、占地方；右放读经、三件大事 + 任务、笔记、家人的安排——这些条目少、临时性强。 */
function viewToday(){
  const day = wb.viewDay(), past = day !== S.day, now = new Date(), h = now.getHours(), dt = new Date(day + "T12:00:00");
  const greet = h < 5 ? t("夜深了") : h < 11 ? t("早安") : h < 14 ? t("午安") : h < 18 ? t("下午好") : t("晚上好");
  const list = wb.forDay(day).filter(p => !(p.meta && p.meta.preset));   // 陪伴 / 休息是顶部卡片的记录，不进「今日习惯」和统计（回顾 → 记录里照常查）
  /* 日期选择放在大卡片里：‹ 日期 ›（补记时多一个“回到今天”） */
  const hero = `<section class="hero"><div class="moon"></div>
    <div class="hero-top"><span class="lbl">${t("周{d}", { d: t(WEEKDAY[dt.getDay()]) })}${past ? ` · ${t("补记")}` : ""}</span>
      <span class="hero-date"><button class="hbtn" data-act="day-prev" aria-label="${t("前一天")}">‹</button><input type="date" id="pick-day" class="hdate" value="${esc(day)}" min="${wb.dayAdd(S.day, -wb.HISTORY_DAYS)}" max="${S.day}" aria-label="${t("选择日期（可补记前几天）")}"><button class="hbtn" data-act="day-next" aria-label="${t("后一天")}" ${past ? "" : "disabled"}>›</button>${past ? `<button class="hbtn txt" data-act="day-today">${t("回到今天")}</button>` : ""}</span></div>
    <div class="big">${past ? esc(t("补记 {d}", { d: day.slice(5).replace("-", "/") })) : `${esc(greet)}，${esc(myName())}`}</div>
    ${past ? `<div class="hero-note">${t("正在补记，打卡会记到这一天")}</div>` : ""}</section>`;
  // data-o：手机上的先后顺序；a / b：电脑上的左右栏
  const sec = (id, o, html) => (html ? `<section class="tsec" id="sec-${id}" style="--o:${o}">${html}</section>` : "");
  const colA = "";   // 习惯、家人搬到「今天 / 习惯」页（js/habits-page.js）
  const colB = [sec("reading", 1, readingHTML()), sec("tasks", 2, mitBlock() + tasksBlock()), sec("notes", 4, notesHTML()), sec("famtasks", 7, familyTasks(day))].join("");
  const joinNote = isOwner() && S.pending.length ? `<div class="nudge"><b>${t("{n} 人申请加入家庭", { n: S.pending.length })}</b> <button class="chip" data-act="settings">${t("去批准")}</button></div>` : "";
  return `${heroTrackHTML(hero, past)}${releaseBadgeHTML()}${joinNote}${nudgeBar()}${kpisHTML(day, list)}${askEntryHTML()}<div class="tgrid"><div class="tcol tcol-a">${colA}</div><div class="tcol tcol-b">${colB}</div></div>`;
}

function kpisHTML(day, list){
  const past = day !== S.day, cards = [];
  // 习惯（不含读经，读经单独一张）
  const hab = list.filter(p => p.kind !== "scripture"), habLeft = hab.filter(p => !wb.statusOf(p, day).done);
  cards.push(hab.length ? kpiCard({ label: t("习惯"), value: hab.length - habLeft.length, unit: `/${hab.length}`, pct: (hab.length - habLeft.length) / hab.length * 100,
    sub: habLeft.length ? `${t("还剩")} ${leftText(habLeft.map(p => p.name || t(kindOf(p).label)))}` : `✓ ${t("全部完成")}`, state: habLeft.length ? "" : "done", target: "tab:habits" })
    : kpiCard({ label: t("习惯"), value: "–", sub: t("今天没有安排"), target: "tab:habits" }));
  // 任务：今天已完成 + 还没做的（逾期 + 当天）
  if (S.tk && S.tk.loaded && !S.tk.error) {
    const doneN = tk.doneLogs().filter(l => l.day === day).length, od = past ? [] : tk.overdue(), todo = tk.onDay(day).filter(x => !x.virtual), left = [...od, ...todo], total = doneN + left.length;
    cards.push(total ? kpiCard({ label: t("任务"), value: doneN, unit: `/${total}`, pct: doneN / total * 100,
      sub: od.length ? `${t("逾期 {n} 件", { n: od.length })} · ${t("共剩 {n} 项", { n: left.length })}` : left.length ? `${t("还剩")} ${leftText(left.map(x => x.title))}` : `✓ ${t("全部完成")}`,
      state: od.length ? "warn" : left.length ? "" : "done", target: "sec-tasks" })
      : kpiCard({ label: t("任务"), value: "–", sub: t("今天没有排任务"), target: "sec-tasks" }));
  }
  // 读经：读了没有 + 连续天数
  const tp = wb.todayPassage(), rl = wb.readingLog(day) || wb.logsOfKind("scripture", day)[0], sp = wb.firstOfKind("scripture"), sk = sp ? wb.streak(sp) : 0;
  cards.push(kpiCard({ label: t("读经"), value: rl ? "✓" : tp || sp ? t("未读") : "–", pct: tp || sp || rl ? (rl ? 100 : 0) : null,
    sub: rl ? (sk ? t("连续 {n} 天", { n: sk }) : t("今天读了")) : tp ? `${t("今天")}：${esc(tp.item.label)}` : t("选个读经计划"), state: rl ? "done" : "", target: "sec-reading" }));
  // 祷告：今天几次（有目标就带进度）+ 代祷中几项
  const pp = wb.firstOfKind("prayer"), pst = pp ? wb.statusOf(pp, day) : null, cnt = pp ? pst.count : wb.logsOfKind("prayer", day).length, goal = pp && pp.target && pp.target.count ? pp.target.count : 0;
  cards.push(kpiCard({ label: t("祷告"), value: cnt, unit: goal ? `/${goal}` : t("次"), pct: goal ? Math.min(100, cnt / goal * 100) : null,
    sub: t("代祷中 {n} 项", { n: S.wb.prayers.filter(x => x.status !== "answered").length }), state: goal && cnt >= goal ? "done" : "", target: "tab:prayer" }));
  return `<div class="kpis">${cards.join("")}</div>`;
}

/* 灵修笔记：和“读经”同样的版式——标题 + 右上角入口，卡片里一行摘要和两个主按钮；往年今天写过的显示在下面 */
function notesHTML(){
  const tp = wb.todayPassage(), rl = wb.readingLog(), ref = rl ? (rl.data.ref || "") : tp ? tp.item.label : "";
  const st = S.nt && S.nt.loaded ? S.nt.stats : null, loaded = !!st, n = loaded ? st.mine : 0, last = loaded ? st.latest : null;   // 条数、最近一条来自统计 RPC（nt.js），不读全部笔记
  const sum = last ? `${t("最近：{h}", { h: esc(noteHeading(last, kindLabel)) })} · ${esc(last.day)}` : t("读书、读经、祷告时的心得、疑问或感动，随手记在这里。");
  return `${secHead(t("灵修笔记"), chipBtn(t("全部") + (n ? ` ${n}` : ""), 'data-act="notes"'))}<div class="panel"><div class="small muted">${sum}</div>
    <div class="ui-acts btns"><button class="ui-btn" data-tone="primary" data-act="note-add" data-kind="reading" data-photo="1">📷 ${t("拍照摘录")}</button><button class="ui-btn" data-tone="ghost" data-act="note-add" data-kind="scripture" data-ref="${esc(ref)}">✎ ${t("记心得")}</button></div></div>${loaded ? otdHTML(2) : ""}`;
}

export { viewToday };
