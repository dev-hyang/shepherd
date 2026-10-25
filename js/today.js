import { myName } from "./core/auth.js";
import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm } from "./core/util.js";
import { KINDS, RATINGS, WEEKDAY, kindOf, modeOf } from "./data/kinds.js";
import * as tk from "./tk.js";
import * as wb from "./wb.js";
import { kindLabel, otdHTML } from "./notes.js";
import { noteHeading } from "./notes-lib.js";
import { askEntryHTML } from "./ask.js";
import { chipBtn, secHead } from "./ui.js";
import { familyTasks, mitBlock, nudgeBar, tasksBlock } from "./tasks.js";

/* ============ 今天页：读经 → 今日习惯 → 家人 ============ */
/* ============ 今天页的版式 ============
   自上而下：① 大卡片（问候 + 日期，补记时在这里切换）② 紧急提醒（逾期 / 马上要做）③ 四张统计卡（习惯、任务、读经、祷告：完成几项、还剩什么，点一下滚到对应区块）④ 内容区。
   内容区手机一栏，按“一天怎么过”排：读经 → 三件大事 + 今日任务 → 今日习惯 → 灵修笔记 → 家人；
   电脑（≥900px）分两栏：左“行动”（三件大事、任务、家人的安排），右“日常”（读经、习惯、笔记、家人）。 */
function viewToday(){
  const day = wb.viewDay(), past = day !== S.day, now = new Date(), h = now.getHours(), dt = new Date(day + "T12:00:00");
  const greet = h < 5 ? t("夜深了") : h < 11 ? t("早安") : h < 14 ? t("午安") : h < 18 ? t("下午好") : t("晚上好");
  const list = wb.forDay(day);
  /* 日期选择放在大卡片里：‹ 日期 ›（补记时多一个“回到今天”） */
  const hero = `<section class="hero"><div class="moon"></div>
    <div class="hero-top"><span class="lbl">${t("周{d}", { d: t(WEEKDAY[dt.getDay()]) })}${past ? ` · ${t("补记")}` : ""}</span>
      <span class="hero-date"><button class="hbtn" data-act="day-prev" aria-label="${t("前一天")}">‹</button><input type="date" id="pick-day" class="hdate" value="${esc(day)}" min="${wb.dayAdd(S.day, -wb.HISTORY_DAYS)}" max="${S.day}" aria-label="${t("选择日期（可补记前几天）")}"><button class="hbtn" data-act="day-next" aria-label="${t("后一天")}" ${past ? "" : "disabled"}>›</button>${past ? `<button class="hbtn txt" data-act="day-today">${t("回到今天")}</button>` : ""}</span></div>
    <div class="big">${past ? esc(t("补记 {d}", { d: day.slice(5).replace("-", "/") })) : `${esc(greet)}，${esc(myName())}`}</div>
    ${past ? `<div class="hero-note">${t("正在补记，打卡会记到这一天")}</div>` : ""}</section>`;
  // data-o：手机上的先后顺序；a / b：电脑上的左右栏
  const sec = (id, o, html) => (html ? `<section class="tsec" id="sec-${id}" style="--o:${o}">${html}</section>` : "");
  const colA = [sec("tasks", 2, mitBlock() + tasksBlock()), sec("famtasks", 7, familyTasks(day))].join("");
  const colB = [sec("reading", 1, readingHTML()), sec("habits", 3, habitsHTML(day, list)), sec("notes", 4, notesHTML()), sec("family", 6, familyHTML(day))].join("");
  return `${hero}${nudgeBar()}${kpisHTML(day, list)}${askEntryHTML()}<div class="tgrid"><div class="tcol tcol-a">${colA}</div><div class="tcol tcol-b">${colB}</div></div>`;
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
    sub: habLeft.length ? `${t("还剩")} ${leftText(habLeft.map(p => p.name || t(kindOf(p).label)))}` : `✓ ${t("全部完成")}`, state: habLeft.length ? "" : "done", target: "sec-habits" })
    : kpiCard({ label: t("习惯"), value: "–", sub: t("今天没有安排"), target: "sec-habits" }));
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
  const loaded = !!(S.nt && S.nt.loaded), n = loaded ? S.nt.mine.length : 0, last = loaded ? S.nt.mine[0] : null;
  const sum = last ? `${t("最近：{h}", { h: esc(noteHeading(last, kindLabel)) })} · ${esc(last.day)}` : t("读书、读经、祷告时的心得、疑问或感动，随手记在这里。");
  return `${secHead(t("灵修笔记"), chipBtn(t("全部") + (n ? ` ${n}` : ""), 'data-act="notes"'))}<div class="panel"><div class="small muted">${sum}</div>
    <div class="btns"><button class="btn primary" data-act="note-add" data-kind="reading" data-photo="1">📷 ${t("拍照摘录")}</button><button class="btn" data-act="note-add" data-kind="scripture" data-ref="${esc(ref)}">✎ ${t("记心得")}</button></div></div>${loaded ? otdHTML(2) : ""}`;
}

/* 读经：计划里今天这一段。读完打勾进一格；也可以记一段计划外的 */
function readingHTML(){
  const tp = wb.todayPassage(), rl = wb.readingLog(), extra = wb.logsOfKind("scripture", wb.viewDay()).filter(l => l !== rl);
  const s = wb.settings(), zh = s.versionZh || "和合本", en = s.versionEn == null ? "BSB" : s.versionEn;
  let body;
  if (!tp) body = `<p class="muted">${t("还没选读经计划。选一个，每天这里就会列出当天的段落。")}</p><div class="btns" style="margin-top:0"><button class="btn primary" data-act="plan">${t("选读经计划")}</button><button class="btn" data-act="read-other">${t("记一段读过的")}</button></div>`;
  else {
    const it = tp.item;
    // 读完后：大字显示今天读了哪段，小字预告明天；没读完：大字是今天这段
    const headline = rl ? `<b style="font-size:18px">${esc(rl.data.ref || it.label)} ✓</b><div class="small muted">${t("明天：{label}", { label: esc(it.label) })}</div>` : `<b style="font-size:18px">${esc(it.label)}</b>${it.note ? `<div class="small">${esc(it.note)}</div>` : ""}`;
    body = `<div class="row"><div class="v">${headline}<div class="small muted">${tc(esc(tp.plan.name))} · ${t("第 {i} / {n} 段", { i: tp.index + 1, n: tp.total })}${tp.round ? ` · ${t("第 {r} 轮", { r: tp.round + 1 })}` : ""}</div></div></div>
    ${!rl && it.parts && it.parts.length ? `<div class="btns" style="margin-top:10px"><button class="chip" data-act="read-text" aria-pressed="${S.showText}">${S.showText ? t("收起经文") : t("显示经文")}</button>${S.showText ? `<span class="small muted" style="align-self:center">${esc(zh)}${en ? " · " + esc(en) : ""} <button class="chip" data-act="plan">${t("换译本")}</button></span>` : ""}</div>
    ${S.showText ? `<div id="passage" class="passage"><p class="muted small">${t("正在抓取经文…")}</p></div>` : ""}` : ""}
    <div class="btns">${rl ? `<button class="btn" data-act="read-undo">${t("今天读完了 ✓ · 点击撤销")}</button>` : `<button class="btn primary" data-act="read-done">${t("读完了")}</button>`}<button class="btn" data-act="read-other">${t("另记一段")}</button></div>`;
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

/* 今日习惯：每种打卡方式一行 */
function habitsHTML(day, list){
  const rows = list.filter(p => p.kind !== "scripture");
  if (!S.wb.practices.length) return `${secHead(t("今日习惯"))}<div class="panel"><div class="empty">${t("还没有习惯。")}<br>${t("一键起步会建立：读经、祷告、锻炼（每周 3 次）、屏幕时长、健康饮食、专注，之后随时改。")}<br><button class="btn primary" data-act="template-apply">${t("一键起步")}</button> <button class="btn" data-act="habit-add">${t("自己添加")}</button></div></div>`;
  const row = p => { const k = kindOf(p), st = wb.statusOf(p, day), tg = p.target || {}, sc = p.schedule || {};
    const times = sc.times && sc.times.length ? sc.times.join(" ") : "";
    let meta = "", acts = "";
    switch (st.mode) {
      case "check": meta = st.done ? t("做到了 ✓") : times; acts = `<button class="iconbtn ${st.done ? "ok" : ""}" data-act="check" data-pid="${esc(p.id)}" aria-pressed="${st.done}" aria-label="${t("完成")}">✓</button>`; break;
      case "count": meta = st.count ? t("今天 {n} 次", { n: st.count }) + (st.done ? " ✓" : "") : times;
        acts = `${st.count ? `<button class="chip" data-act="count-undo" data-pid="${esc(p.id)}">${t("撤销")}</button>` : ""}<button class="iconbtn ${st.done ? "ok" : ""}" data-act="count-add" data-pid="${esc(p.id)}" aria-label="${t("记一次")}">＋</button>`; break;
      case "minutes": { const wk = tg.per === "week" ? wb.weekOf(p, day) : null;
        if (p.kind === "focus") { // 由计时器记录：一段一条；目标是每天几段
          meta = `${t("今天 {n} 段 · {m} 分钟", { n: st.sessions, m: st.minutes })}${tg.count ? ` / ${t("{n} 段", { n: tg.count })}` : ""}${(tg.count ? st.sessions >= tg.count : st.sessions > 0) ? " ✓" : ""}`;
          acts = `${st.sessions ? `<button class="chip" data-act="min-list" data-pid="${esc(p.id)}">${st.sessions}</button>` : ""}<button class="btn primary" style="flex:none;min-height:40px;padding:8px 16px" data-act="focus" data-pid="${esc(p.id)}">${t("开始")}</button>`; break; }
        meta = wk ? `${t("本周 {a}/{b} 次", { a: wk.sessions, b: wk.count || "–" })}${wk.minutesGoal ? ` · ${t("{a}/{b} 分钟", { a: wk.minutes, b: wk.minutesGoal })}` : ` · ${t("{m} 分钟", { m: wk.minutes })}`}${st.sessions ? " · " + t("今天 ✓") : ""}`
          : `${t("今天 {m} 分钟", { m: st.minutes })}${tg.minutes ? ` / ${tg.minutes}` : ""}${st.done ? " ✓" : ""}`;
        acts = `${st.sessions ? `<button class="chip" data-act="min-list" data-pid="${esc(p.id)}">${st.sessions}</button>` : ""}<button class="iconbtn ${st.done ? "ok" : ""}" data-act="min-add" data-pid="${esc(p.id)}" aria-label="${t("记一次")}">＋</button>`; break; }
      case "rating": meta = st.done ? t(RATINGS[st.rating] || "") + (st.log && st.log.data.note ? ` · ${esc(st.log.data.note)}` : "") : t("今天吃得怎么样？");
        acts = `<span class="seg mini">${[3, 2, 1].map(v => `<button data-act="rate" data-pid="${esc(p.id)}" data-v="${v}" aria-pressed="${st.rating === v}">${t(RATINGS[v])}</button>`).join("")}</span>`; break;
      case "value": { const unit = t(k.unit || ""); meta = st.done ? `${st.value} ${unit}${tg.max ? ` / ${t("≤ {m}", { m: tg.max })}` : tg.min ? ` / ${t("≥ {m}", { m: tg.min })}` : ""}${st.over ? ` · <span style="color:var(--rose)">${t("超了")}</span>` : st.done ? " ✓" : ""}` : (p.kind === "screen" ? t("今天用了多久？晚上看一眼系统的屏幕使用时间填进来") : t("昨晚睡了几小时？"));
        acts = `<button class="chip" data-act="value-set" data-pid="${esc(p.id)}">${st.done ? t("改") : t("填")}</button>`; break; }
      case "slots": meta = `${esc((p.meta || {}).dose || "")}${p.meta && p.meta.stock != null && p.meta.stock !== "" ? ` · ${t("剩 {n}", { n: p.meta.stock })}${+p.meta.stock <= (+p.meta.refillAt || 7) * st.expected ? ` <span style="color:var(--rose)">${t("该补货了")}</span>` : ""}` : ""}`;
        acts = `<span class="slots">${st.slots.map(s => `<span class="slot"><span class="small muted">${esc(s.time)}</span>${s.log ? `<button class="chip" data-act="slot" data-pid="${esc(p.id)}" data-slot="${esc(s.time)}" data-v="undo" aria-pressed="true">${s.taken ? t("服了 ✓") : t("跳过")}</button>` : `<button class="chip" data-act="slot" data-pid="${esc(p.id)}" data-slot="${esc(s.time)}" data-v="taken">${t("服了")}</button><button class="chip" data-act="slot" data-pid="${esc(p.id)}" data-slot="${esc(s.time)}" data-v="skip">${t("跳过")}</button>`}</span>`).join("")}</span>`; break;
    }
    return `<div class="habit ${st.done ? "done" : ""} ${["rating", "slots"].includes(st.mode) ? "stack" : ""}"><span class="hi" style="background:${k.color}22;color:${k.color}">${k.icon}</span>
      <button class="main" data-act="habit-edit" data-pid="${esc(p.id)}"><span class="title">${esc(p.name || t(k.label))}</span><span class="meta">${meta}</span></button>
      <span class="acts">${acts}</span></div>`; };
  const done = rows.filter(p => wb.statusOf(p, day).done).length;
  return `${secHead(t("今日习惯"), chipBtn(t("管理"), 'data-act="habits"'), rows.length ? `${done}/${rows.length}` : "")}
  <div class="panel" style="padding:4px 10px">${rows.length ? rows.map(row).join("") : `<div class="empty">${t("今天没有安排的习惯。")}</div>`}</div>
  ${rows.length ? `<p class="small muted" style="margin-top:8px">${t("按周算的（如每周 3 次锻炼）哪天做都算。")}</p>` : ""}`;
}

/* 家人开给我看的：只读 */
function familyHTML(day){
  if (!S.family) return "";
  const fam = wb.familyToday(day);
  if (!fam.length) return S.wb.fam.practices.length ? "" : `${secHead(t("家人"))}<div class="panel"><p class="small muted">${t("家人还没有开给你看的习惯。每一项习惯都可以在“管理”里单独设为“家人可见”，互相看到做了没有，彼此提醒。")}</p></div>`;
  const item = ({ p, st, week }) => { const k = kindOf(p);
    const txt = week ? t("本周 {a}/{b} 次", { a: week.sessions, b: week.count || "–" }) : st.mode === "minutes" ? t("{m} 分钟", { m: st.minutes }) : st.mode === "value" && st.done ? `${st.value} ${t(k.unit || "")}` : st.mode === "rating" && st.done ? t(RATINGS[st.rating] || "") : st.mode === "slots" ? `${st.taken}/${st.expected}` : st.mode === "count" && st.count ? t("{n} 次", { n: st.count }) : "";
    return `<span class="fam-item ${st.done ? "done" : ""}">${k.icon} ${esc(p.name || t(k.label))}${txt ? ` <span class="small muted">${txt}</span>` : ""} ${st.done ? "✓" : "○"}</span>`; };
  return `${secHead(t("家人"))}<div class="panel">${fam.map(m => `<div class="fam"><b>${esc(m.name)}</b><div class="fam-items">${m.items.map(item).join("")}</div></div>`).join("")}
  <p class="small muted" style="margin-top:8px">${t("只显示对方设为“家人可见”的习惯；祷告清单的内容谁也看不到。")}</p></div>`;
}

export { viewToday };
