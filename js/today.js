import { myName } from "./core/auth.js";
import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm } from "./core/util.js";
import { KINDS, RATINGS, WEEKDAY, kindOf, modeOf } from "./data/kinds.js";
import * as wb from "./wb.js";
import { familyTasks, mitBlock, nudgeBar, tasksBlock } from "./tasks.js";

/* ============ 今天页：读经 → 今日习惯 → 家人 ============ */
function viewToday(){
  const day = wb.viewDay(), past = day !== S.day, now = new Date(), h = now.getHours(), dt = new Date(day + "T12:00:00");
  const greet = h < 5 ? t("夜深了") : h < 11 ? t("早安") : h < 14 ? t("午安") : h < 18 ? t("下午好") : t("晚上好");
  const list = wb.forDay(day), done = list.filter(p => wb.statusOf(p, day).done).length;
  const sp = wb.firstOfKind("scripture"), sk = sp ? wb.streak(sp) : 0;
  return `
  <section class="hero"><div class="moon"></div>
    <div class="lbl">${day} · ${t("周{d}", { d: t(WEEKDAY[dt.getDay()]) })}</div>
    <div class="big">${past ? esc(t("补记 {d}", { d: day.slice(5).replace("-", "/") })) : `${esc(greet)}，${esc(myName())}`}</div>
    <div class="meta">${list.length ? `<span>${past ? t("当天 {a}/{b}", { a: done, b: list.length }) : t("今天 {a}/{b}", { a: done, b: list.length })}</span>` : ""}${sk ? `<span>${t("连续读经 {n} 天", { n: sk })}</span>` : ""}</div></section>
  ${dayBarHTML(day, past)}
  ${nudgeBar()}${mitBlock()}${tasksBlock()}
  ${readingHTML()}
  ${habitsHTML(day, list)}
  ${familyHTML(day)}
  ${familyTasks(day)}`;
}

/* 补记：忘了点的话，切到前几天再打卡 / 记读经。‹ › 翻一天，也可以直接选日期（最早 12 周内，不能选未来） */
function dayBarHTML(day, past){
  return `<div class="daybar">
    <button class="chip" data-act="day-prev" aria-label="${t("前一天")}">‹</button>
    <input type="date" id="pick-day" value="${esc(day)}" min="${wb.dayAdd(S.day, -wb.HISTORY_DAYS)}" max="${S.day}" aria-label="${t("选择补记的日期")}">
    <button class="chip" data-act="day-next" aria-label="${t("后一天")}" ${past ? "" : "disabled"}>›</button>
    ${past ? `<button class="chip" data-act="day-today">${t("回到今天")}</button><span class="small" style="color:var(--rose)">${t("正在补记，打卡会记到这一天")}</span>`
           : `<span class="small muted">${t("忘了打卡？点 ‹ 选前几天补记")}</span>`}</div>`;
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
  const extraRows = extra.map(l => `<div class="small muted" style="margin-top:6px" data-swipe>${t("另读了")} <b>${esc(l.data.ref || "")}</b>${l.data.note ? ` · ${esc(l.data.note)}` : ""} <button class="chip swipe-src" data-act="log-del" data-lid="${esc(l.id)}">${t("删")}</button></div>`).join("");
  if (S.showText && tp && tp.item.parts && tp.item.parts.length) loadPassage(tp.item, zh, en);
  return `<h2>${t("读经")}</h2><div class="panel ${rl ? "done" : ""}">${body}${extraRows}</div>`;
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
  if (!S.wb.practices.length) return `<h2>${t("今日习惯")}</h2><div class="panel"><div class="empty">${t("还没有习惯。")}<br>${t("一键起步会建立：读经、祷告、锻炼（每周 3 次）、屏幕时长、健康饮食、专注，之后随时改。")}<br><button class="btn primary" data-act="template-apply">${t("一键起步")}</button> <button class="btn" data-act="habit-add">${t("自己添加")}</button></div></div>`;
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
    return `<div class="habit ${st.done ? "done" : ""}"><span class="hi" style="background:${k.color}22;color:${k.color}">${k.icon}</span>
      <button class="main" data-act="habit-edit" data-pid="${esc(p.id)}"><span class="title">${esc(p.name || t(k.label))}</span><span class="meta">${meta}</span></button>
      <span class="acts">${acts}</span></div>`; };
  const done = rows.filter(p => wb.statusOf(p, day).done).length;
  return `<h2>${t("今日习惯")} <button class="chip" data-act="habits" style="font-family:var(--f-body);font-weight:400;vertical-align:middle">${t("管理")}</button></h2>
  <div class="panel" style="padding:4px 10px">${rows.length ? rows.map(row).join("") : `<div class="empty">${t("今天没有安排的习惯。")}</div>`}</div>
  ${rows.length ? `<p class="small muted" style="margin-top:8px">${t("完成 {a}/{b}", { a: done, b: rows.length })}。${t("按周算的（如每周 3 次锻炼）哪天做都算。")}</p>` : ""}`;
}

/* 家人开给我看的：只读 */
function familyHTML(day){
  if (!S.family) return "";
  const fam = wb.familyToday(day);
  if (!fam.length) return S.wb.fam.practices.length ? "" : `<h2>${t("家人")}</h2><div class="panel"><p class="small muted">${t("家人还没有开给你看的习惯。每一项习惯都可以在“管理”里单独设为“家人可见”，互相看到做了没有，彼此提醒。")}</p></div>`;
  const item = ({ p, st, week }) => { const k = kindOf(p);
    const txt = week ? t("本周 {a}/{b} 次", { a: week.sessions, b: week.count || "–" }) : st.mode === "minutes" ? t("{m} 分钟", { m: st.minutes }) : st.mode === "value" && st.done ? `${st.value} ${t(k.unit || "")}` : st.mode === "rating" && st.done ? t(RATINGS[st.rating] || "") : st.mode === "slots" ? `${st.taken}/${st.expected}` : st.mode === "count" && st.count ? t("{n} 次", { n: st.count }) : "";
    return `<span class="fam-item ${st.done ? "done" : ""}">${k.icon} ${esc(p.name || t(k.label))}${txt ? ` <span class="small muted">${txt}</span>` : ""} ${st.done ? "✓" : "○"}</span>`; };
  return `<h2>${t("家人")}</h2><div class="panel">${fam.map(m => `<div class="fam"><b>${esc(m.name)}</b><div class="fam-items">${m.items.map(item).join("")}</div></div>`).join("")}
  <p class="small muted" style="margin-top:8px">${t("只显示对方设为“家人可见”的习惯；祷告清单的内容谁也看不到。")}</p></div>`;
}

export { viewToday };
