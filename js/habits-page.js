import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { RATINGS, kindOf } from "./data/kinds.js";
import { howText } from "./med-hero-lib.js";
import { reviewBody } from "./review.js";
import { chipBtn, fab, secHead } from "./ui.js";
import * as wb from "./wb.js";

/* ============ 今天 / 习惯：日期（可补记）→ 今日习惯 → 常用入口 → 家人 → 回顾（趋势） ============
   原来今天页的「今日习惯」「家人」和底部的「回顾」页都合并到这里；新增习惯用右下角 ＋。 */

const link = (attrs, icon, title, desc) => `<button class="ui-row mrow" ${attrs}><span class="mi" aria-hidden="true">${icon}</span><span class="mt"><b>${title}</b><small>${desc}</small></span><span class="ui-chev" aria-hidden="true">›</span></button>`;
/** 日期条：‹ 日期 ›，选以前的日子就是补记（打卡会记到那一天） */
function dayBar(day, past){
  return `<div class="daybar"><button class="ui-btn" data-size="sm" data-tone="ghost" data-act="day-prev" aria-label="${t("前一天")}">‹</button>
    <input type="date" id="pick-day" value="${esc(day)}" min="${wb.dayAdd(S.day, -wb.HISTORY_DAYS)}" max="${S.day}" aria-label="${t("选择日期（可补记前几天）")}">
    <button class="ui-btn" data-size="sm" data-tone="ghost" data-act="day-next" aria-label="${t("后一天")}" ${past ? "" : "disabled"}>›</button>
    ${past ? `<button class="ui-btn" data-size="sm" data-tone="soft" data-act="day-today">${t("回到今天")}</button><span class="small muted">${t("正在补记，打卡会记到这一天")}</span>` : ""}</div>`;
}
function viewHabits(){
  const day = wb.viewDay(), past = day !== S.day, list = wb.forDay(day).filter(p => !(p.meta && p.meta.preset));   // 陪伴 / 休息是顶部卡片的记录，不进今日习惯
  return `${dayBar(day, past)}${habitsHTML(day, list)}
  <div class="panel mlist" style="margin-top:14px;padding:0">
    ${link('data-tab="herocfg"', "⏱", t("顶部卡片"), t("每种药一张「距上次」卡片：显示 / 隐藏、调顺序"))}
    ${link('data-act="meds"', "💊", t("用药与保健品"), t("剂量、时间点、库存与补货提醒"))}
    ${link('data-act="focus"', "🍅", t("专注计时"), t("番茄工作法，完成的段自动记录"))}
    ${link('data-tab="records"', "▤", t("记录"), t("所有打卡一行一条，能改、能补记"))}
  </div>
  ${familyHTML(day)}
  ${secHead(t("回顾"))}${reviewBody()}
  ${fab('data-act="habit-add"', t("新增习惯"))}`;
}

/* 今日习惯：每种打卡方式一行 */
function habitsHTML(day, list){
  const rows = list.filter(p => p.kind !== "scripture");
  if (!S.wb.practices.length) return `${secHead(t("今日习惯"))}<div class="panel"><div class="empty">${t("还没有习惯。")}<br>${t("一键起步会建立：读经、祷告、锻炼（每周 3 次）、屏幕时长、健康饮食、专注，之后随时改。")}<br><button class="ui-btn" data-tone="primary" data-act="template-apply">${t("一键起步")}</button> <button class="ui-btn" data-tone="ghost" data-act="habit-add">${t("自己添加")}</button></div></div>`;
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
          acts = `${st.sessions ? `<button class="chip" data-act="min-list" data-pid="${esc(p.id)}">${st.sessions}</button>` : ""}<button class="ui-btn" data-tone="primary" style="flex:none;min-height:40px;padding:8px 16px" data-act="focus" data-pid="${esc(p.id)}">${t("开始")}</button>`; break; }
        meta = wk ? `${t("本周 {a}/{b} 次", { a: wk.sessions, b: wk.count || "–" })}${wk.minutesGoal ? ` · ${t("{a}/{b} 分钟", { a: wk.minutes, b: wk.minutesGoal })}` : ` · ${t("{m} 分钟", { m: wk.minutes })}`}${st.sessions ? " · " + t("今天 ✓") : ""}`
          : `${t("今天 {m} 分钟", { m: st.minutes })}${tg.minutes ? ` / ${tg.minutes}` : ""}${st.done ? " ✓" : ""}`;
        acts = `${st.sessions ? `<button class="chip" data-act="min-list" data-pid="${esc(p.id)}">${st.sessions}</button>` : ""}<button class="iconbtn ${st.done ? "ok" : ""}" data-act="min-add" data-pid="${esc(p.id)}" aria-label="${t("记一次")}">＋</button>`; break; }
      case "rating": meta = st.done ? t(RATINGS[st.rating] || "") + (st.log && st.log.data.note ? ` · ${esc(st.log.data.note)}` : "") : t("今天吃得怎么样？");
        acts = `<span class="seg mini">${[3, 2, 1].map(v => `<button data-act="rate" data-pid="${esc(p.id)}" data-v="${v}" aria-pressed="${st.rating === v}">${t(RATINGS[v])}</button>`).join("")}</span>`; break;
      case "value": { const unit = t(k.unit || ""); meta = st.done ? `${st.value} ${unit}${tg.max ? ` / ${t("≤ {m}", { m: tg.max })}` : tg.min ? ` / ${t("≥ {m}", { m: tg.min })}` : ""}${st.over ? ` · <span style="color:var(--rose)">${t("超了")}</span>` : st.done ? " ✓" : ""}` : (p.kind === "screen" ? t("今天用了多久？晚上看一眼系统的屏幕使用时间填进来") : t("昨晚睡了几小时？"));
        acts = `<button class="chip" data-act="value-set" data-pid="${esc(p.id)}">${st.done ? t("改") : t("填")}</button>`; break; }
      case "slots": meta = `${esc([(p.meta || {}).dose, howText(p.meta, t)].filter(Boolean).join(" · "))}${p.meta && p.meta.stock != null && p.meta.stock !== "" ? ` · ${t("剩 {n}", { n: p.meta.stock })}${+p.meta.stock <= (+p.meta.refillAt || 7) * st.expected ? ` <span style="color:var(--rose)">${t("该补货了")}</span>` : ""}` : ""}`;
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


export { viewHabits };
