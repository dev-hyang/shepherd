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

/* 统计卡：数字（完成/总数）+ 进度条 + 一行说明（还剩什么 / 全部完成 / 逾期）。全部做完变绿 */
function kpiCard({ label, value, unit = "", pct = null, sub = "", state = "", target }){
  const attr = target.startsWith("tab:") ? `data-tab="${target.slice(4)}"` : `data-scroll="${target}"`;
  return `<button class="kpi ${state}" ${attr}><span class="kl">${label}</span><span class="kv">${value}${unit ? `<small>${unit}</small>` : ""}</span>
    ${pct == null ? "" : `<span class="kbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${label}"><i style="width:${Math.round(pct)}%"></i></span>`}
    <span class="ks ${state === "warn" ? "warn" : ""}">${sub}</span></button>`;
}
/** 还剩哪几项：最多列两个名字，其余写“等 N 项” */
const leftText = names => (names.length <= 2 ? names.map(esc).join("、") : t("{a} 等 {n} 项", { a: names.slice(0, 2).map(esc).join("、"), n: names.length }));
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

/* 读经：计划里今天这一段。读完打勾进一格；也可以记一段计划外的 */
function readingHTML(){
  const tp = wb.todayPassage(), rl = wb.readingLog(), extra = wb.logsOfKind("scripture", wb.viewDay()).filter(l => l !== rl);
  const s = wb.settings(), zh = s.versionZh || "和合本", en = s.versionEn == null ? "BSB" : s.versionEn;
  let body;
  if (!tp) body = `<p class="muted">${t("还没选读经计划。选一个，每天这里就会列出当天的段落。")}</p><div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="primary" data-act="plan">${t("选读经计划")}</button><button class="ui-btn" data-tone="ghost" data-act="read-other">${t("记一段读过的")}</button></div>`;
  else {
    const it = tp.item;
    // 读完后：大字显示今天读了哪段，小字预告明天；没读完：大字是今天这段
    const headline = rl ? `<b style="font-size:18px">${esc(rl.data.ref || it.label)} ✓</b><div class="small muted">${t("明天：{label}", { label: esc(it.label) })}</div>` : `<b style="font-size:18px">${esc(it.label)}</b>${it.note ? `<div class="small">${esc(it.note)}</div>` : ""}`;
    body = `<div class="row"><div class="v">${headline}<div class="small muted">${tc(esc(tp.plan.name))} · ${t("第 {i} / {n} 段", { i: tp.index + 1, n: tp.total })}${tp.round ? ` · ${t("第 {r} 轮", { r: tp.round + 1 })}` : ""}</div></div></div>
    ${!rl && it.parts && it.parts.length ? `<div class="ui-acts btns" style="margin-top:10px"><button class="chip" data-act="read-text" aria-pressed="${S.showText}">${S.showText ? t("收起经文") : t("显示经文")}</button>${S.showText ? `<span class="small muted" style="align-self:center">${esc(zh)}${en ? " · " + esc(en) : ""} <button class="chip" data-act="plan">${t("换译本")}</button></span>` : ""}</div>
    ${S.showText ? `<div id="passage" class="passage"><p class="muted small">${t("正在抓取经文…")}</p></div>` : ""}` : ""}
    <div class="ui-acts btns">${rl ? `<button class="ui-btn" data-tone="ghost" data-act="read-undo">${t("今天读完了 ✓ · 点击撤销")}</button>` : `<button class="ui-btn" data-tone="primary" data-act="read-done">${t("读完了")}</button>`}<button class="ui-btn" data-tone="ghost" data-act="read-other">${t("另记一段")}</button></div>`;
  }
  const extraRows = extra.map(l => `<div class="small muted" style="margin-top:6px" data-swipe-del="extra-read">${t("另读了")} <b>${esc(l.data.ref || "")}</b>${l.data.note ? ` · ${esc(l.data.note)}` : ""} <button class="chip swipe-src" data-act="log-del" data-lid="${esc(l.id)}">${t("删")}</button></div>`).join("");
  if (S.showText && tp && tp.item.parts && tp.item.parts.length) loadPassage(tp.item, zh, en);
  return `${secHead(t("读经"), chipBtn(t("计划"), 'data-act="plan"'))}<div class="panel ${rl ? "done" : ""}">${body}${extraRows}</div>`;
}
async function loadPassage(item, zh, en){
  // 渲染时被调用，这时 #passage 还没插进页面：等一拍再找容器
  await new Promise(r => setTimeout(r, 0));
  const box = () => document.querySelector("#passage"); if (!box()) return;
  const zhText = await wb.passageText(item, zh);
  if (!box()) return;
  const chap = (c, enC) => `<h3 style="margin-top:12px">${esc(c.title)}</h3>${c.error ? `<p class="small muted">${t("没取到：")}${esc(c.error)}</p>` : c.verses.map((v, i) => `<p class="verse"><sup>${v.v}</sup>${esc(v.text)}${enC && enC.verses && enC.verses[i] ? `<span class="en">${esc(enC.verses[i].text)}</span>` : ""}</p>`).join("")}`;
  box().innerHTML = zhText.map(c => chap(c, null)).join("");
  if (en) { const enText = await wb.passageText(item, en); if (box()) box().innerHTML = zhText.map((c, i) => chap(c, enText[i])).join(""); }
}

export { viewToday };
