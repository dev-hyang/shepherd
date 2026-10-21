import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { RATINGS, kindOf, modeOf } from "./data/kinds.js";
import * as wb from "./wb.js";

/* ============ 回顾页：本周 / 4 周 / 12 周 ============
   每项习惯一块：这段时间做到的天数或分钟，和上一段同样长的时间比；选中的一项画柱状图；下面是最近 28 天的格子。
   读经和祷告只显示"连续性"，不打分、不排名：格子是提醒，不是成绩单。 */
const RANGES = { "1w": { days: 7, label: "本周" }, "4w": { days: 28, label: "4 周" }, "12w": { days: 84, label: "12 周" } };
const dayList = (to, n) => [...Array(n)].map((_, i) => wb.dayAdd(to, -(n - 1 - i)));

// 某一天这项的"值"：做了 1 / 没做 0；分钟；屏幕分钟；睡眠小时；饮食评分；用药服了几次。没排的日子返回 null
function dayValue(p, day){
  const mode = modeOf(p);
  if (!wb.scheduledOn(p, day) && mode !== "minutes") return null;
  const st = wb.statusOf(p, day);
  if (mode === "minutes") return st.minutes || (st.sessions ? 1 : 0) ? st.minutes : (day <= S.day ? 0 : null);
  if (mode === "value") return st.done ? st.value : null;
  if (mode === "rating") return st.done ? st.rating : null;
  if (mode === "slots") return st.taken;
  if (mode === "count") return st.count;
  return st.done ? 1 : 0;
}
// 一段时间的汇总
function summarize(p, days){
  const mode = modeOf(p), vals = days.map(d => dayValue(p, d));
  const scheduled = days.filter(d => wb.scheduledOn(p, d)).length;
  if (p.kind === "focus") { const segs = days.reduce((n, d) => n + wb.statusOf(p, d).sessions, 0), minutes = vals.reduce((n, v) => n + (v || 0), 0); return { main: segs, unit: "段", sub: t("{m} 分钟", { m: minutes }), minutes, sessions: segs }; }
  if (mode === "minutes") { const minutes = vals.reduce((s, v) => s + (v || 0), 0), sessions = days.filter(d => wb.statusOf(p, d).sessions).length; return { main: minutes, unit: "分钟", sub: t("{n} 次", { n: sessions }), minutes, sessions }; }
  if (mode === "value") { const vs = vals.filter(v => v != null); const avg = vs.length ? Math.round(vs.reduce((s, v) => s + v, 0) / vs.length * 10) / 10 : null; return { main: avg, unit: kindOf(p).unit, sub: t("{n} 天有记录", { n: vs.length }), lowerBetter: !!kindOf(p).lowerBetter }; }
  if (mode === "rating") { const vs = vals.filter(v => v != null); const good = vs.filter(v => v === 3).length; return { main: vs.length ? Math.round(good / vs.length * 100) : null, unit: "%", sub: t("{a}/{b} 天吃得好", { a: good, b: vs.length }) }; }
  if (mode === "slots") { const exp = days.reduce((s, d) => s + (wb.scheduledOn(p, d) ? wb.statusOf(p, d).expected : 0), 0), taken = vals.reduce((s, v) => s + (v || 0), 0); return { main: exp ? Math.round(taken / exp * 100) : null, unit: "%", sub: t("{a}/{b} 次服了", { a: taken, b: exp }) }; }
  const done = days.filter(d => wb.scheduledOn(p, d) && wb.statusOf(p, d).done).length;
  return { main: done, unit: "天", sub: t("/ {n} 天", { n: scheduled }), done, scheduled };
}
function viewReview(){
  const practices = S.wb.practices.filter(p => !p.archived);
  if (!practices.length) return `<div class="empty">${t("还没有习惯，也就没有可回顾的。")}<br><button class="btn primary" data-tab="today">${t("去今天页添加")}</button></div>`;
  const r = S.review, R = RANGES[r.range] || RANGES["4w"];
  const cur = dayList(S.day, R.days), prev = dayList(wb.dayAdd(S.day, -R.days), R.days);
  if (!practices.some(p => p.id === r.metric)) r.metric = practices[0].id;
  const sel = wb.practice(r.metric) || practices[0];
  const tile = p => { const k = kindOf(p), a = summarize(p, cur), b = summarize(p, prev);
    let delta = "";
    if (a.main != null && b.main != null && a.main !== b.main) { const up = a.main > b.main, good = a.lowerBetter ? !up : up; delta = `<span class="d ${good ? "good" : "bad"}">${up ? "↑" : "↓"} ${t("上一段 {v}", { v: b.main })}</span>`; }
    const faith = ["scripture", "prayer"].includes(p.kind);
    return `<button class="stat tile ${sel.id === p.id ? "sel" : ""}" data-metric="${esc(p.id)}"><div class="k">${k.icon} ${esc(p.name || t(k.label))}</div><div class="v">${a.main == null ? "–" : a.main}<small>${t(a.unit || "")}</small></div><div class="small muted">${a.sub}${faith ? "" : ""}</div>${delta}</button>`; };
  return `
  <div class="chips" role="group" aria-label="${t("时间范围")}" style="margin-top:12px">${Object.entries(RANGES).map(([k, v]) => `<button class="chip" data-range="${k}" aria-pressed="${r.range === k}">${t(v.label)}</button>`).join("")}</div>
  <div class="stats tiles">${practices.map(tile).join("")}</div>
  <h2>${esc(sel.name || t(kindOf(sel).label))}</h2>
  <div class="panel">${chartHTML(sel, R)}</div>
  <h2>${t("最近 28 天")}</h2>
  <div class="panel">${gridHTML(practices)}</div>
  <p class="small muted" style="margin-top:8px">${t("读经和祷告的格子只是提醒自己有没有持续，不是成绩；断了接着来就好。屏幕时长越少越好，其余越多越好；箭头和上一段同样长的时间比。")}</p>`;
}
/* 柱状图：本周按天 7 根，4 周 / 12 周按周 */
function chartHTML(p, R){
  const mode = modeOf(p), k = kindOf(p), weekly = R.days > 7;
  const n = weekly ? R.days / 7 : 7, buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    if (weekly) { const a = wb.dayAdd(wb.weekStartOf(S.day), -i * 7); buckets.push({ days: dayList(wb.dayAdd(a, 6), 7).filter(d => d <= S.day), label: a.slice(5).replace("-", "/") }); }
    else { const d = wb.dayAdd(S.day, -i); buckets.push({ days: [d], label: d.slice(5).replace("-", "/") }); }
  }
  const vals = buckets.map(b => { const s = summarize(p, b.days); if (mode === "value") return s.main; if (mode === "rating" || mode === "slots") return s.main; return s.main; });
  const unit = mode === "value" ? t(k.unit || "") : mode === "minutes" ? t("分钟") : (mode === "rating" || mode === "slots") ? "%" : t("天");
  const W = 360, H = 170, P = { l: 8, r: 8, t: 18, b: 22 }, max = Math.max(1, ...vals.filter(v => v != null), (mode === "check" || mode === "count") && !weekly ? 1 : 0);
  const bw = (W - P.l - P.r) / n, Y = v => H - P.b - v / max * (H - P.t - P.b);
  const goal = mode === "value" ? (p.target || {}).max || (p.target || {}).min : mode === "minutes" && (p.target || {}).per === "week" && weekly ? ((p.target || {}).minutes || 0) * ((p.target || {}).count || 1) : null;
  let g = "";
  buckets.forEach((b, i) => { const v = vals[i], x = P.l + i * bw + bw * .15, w = bw * .7;
    if (v != null) { g += `<rect x="${x.toFixed(1)}" y="${Y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, H - P.b - Y(v)).toFixed(1)}" rx="3" fill="${k.color}"/>`; if (n <= 14) g += `<text x="${(x + w / 2).toFixed(1)}" y="${(Y(v) - 4).toFixed(1)}" text-anchor="middle">${v}</text>`; }
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${b.label}</text>`; });
  if (goal && goal <= max) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--ink)" stroke-dasharray="4 4" stroke-opacity=".5"/>`;
  return `<div class="small muted">${weekly ? t("每周合计") : t("每天")} · ${unit}${goal ? ` · ${t("虚线为目标 {g}", { g: goal })}` : ""}</div>
  <div class="scroll-x"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t("{name}柱状图", { name: p.name || t(k.label) }))}">${g}</svg></div>`;
}
/* 28 天格子：每行一项，4 周 × 7 天 */
function gridHTML(practices){
  const days = dayList(S.day, 28);
  const cell = (p, d) => { const v = dayValue(p, d), mode = modeOf(p);
    if (v == null) return `<i class="c none" title="${d}"></i>`;
    const st = wb.statusOf(p, d);
    const ok = mode === "value" ? !st.over && !st.under : mode === "rating" ? v >= 2 : mode === "slots" ? st.expected && st.taken >= st.expected : mode === "minutes" ? v > 0 : st.done;
    const half = mode === "rating" ? v === 2 : mode === "slots" ? st.taken > 0 && st.taken < st.expected : false;
    return `<i class="c ${ok ? "ok" : half ? "half" : "no"}" title="${d}"></i>`; };
  return `<div class="grid28">${practices.map(p => `<div class="grow"><span class="gl">${kindOf(p).icon} ${esc(p.name || t(kindOf(p).label))}</span><span class="gc">${days.map(d => cell(p, d)).join("")}</span></div>`).join("")}</div>
  <div class="legend"><span style="--c:var(--sage)">${t("做到")}</span><span style="--c:var(--honey)">${t("部分")}</span><span style="--c:var(--rose-soft)">${t("没做 / 超了")}</span><span style="--c:var(--line)">${t("没安排")}</span></div>`;
}

export { viewReview, summarize, RANGES };
