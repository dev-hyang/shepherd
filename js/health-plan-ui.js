import { aiReady, askText } from "./ai.js";
import { LS_PREFIX } from "./core/config.js";
import { locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { WEEKDAY } from "./data/kinds.js";
import { DIETS, SLOTS, WORKOUTS } from "./data/health-plans.js";
import { LABS } from "./data/health-ref.js";
import { AI_PLAN_SYSTEM, aiSummary, pantryLink, parsePlanAI, recommend, tplOf, weekStats, workoutOn } from "./health-plan-lib.js";
import * as hl from "./hl.js";
import * as pg from "./pager.js";
import { closeSheet, drawForm, getForm, openForm, openInfo, readForm } from "./sheet.js";
import { secHead } from "./ui.js";
import { render, renderBg } from "./views.js";
import * as wb from "./wb.js";

/* ============ 健康 · 计划 / 训练 / 饮食（阶段 2–4） ============
   少记录优先（用户 2026-11-02 定）：训练按模版「今天照做了」一下就记（分钟数按模版），饮食每餐点一下 照做 / 部分 / 没照做；细节可选。
   给自己记训练时，同时给「锻炼」习惯记一次分钟（js/wb.js），回顾页和连续天数照常算；删掉这次训练，那条打卡也一起删。
   推荐：先规则（health-plan-lib.js，每条写依据），可选让 AI 分析（用户自己的 key，去掉姓名；第一次问一下）。
   饮食模版的采购清单可以一键带到爱家小助手（另一个 Supabase 项目：只是打开爱家的网址，在那边确认后加进采购清单）。 */
const lang = () => (locale() === "en" ? "en" : "zh");
const L = x => (x ? (lang() === "en" ? x.en || x.zh : x.zh || x.en) : "");
const UI = () => S.hlUi;
const fmtDay = d => (d ? d.replace(/-/g, "/") : "");
const TAGS = { bp: "血压", lipid: "血脂", sugar: "血糖", weight: "体重", muscle: "增肌", iron: "铁 / 维 D", kid: "孩子", cardio: "有氧", strength: "力量", flex: "拉伸", gentle: "温和" };
const levelDots = n => `<span class="hl-level" aria-label="${esc(t("难度 {n}/3", { n }))}">${"●".repeat(n)}${"○".repeat(3 - n)}</span>`;
const itemText = it => `${L(it)}${it.sets ? ` · ${it.sets}×${it.reps ? it.reps : it.sec ? t("{n} 秒", { n: it.sec }) : ""}` : it.reps ? ` · ${t("{n} 次", { n: it.reps })}` : it.sec ? ` · ${t("{n} 秒", { n: it.sec })}` : it.min ? ` · ${t("{n} 分钟", { n: it.min })}` : ""}`;
const noTables = () => `<div class="panel small muted" role="status">${t("要记录训练和饮食，请先在 Supabase 执行 baby-log 仓库本地的")} <code>supabase/migrations/027_shepherd_health_plans.sql</code>${t("。内置模版照常可以看。")}</div>`;

/* ---- 这个人的计划（存在 hl_profiles.data.plan） ---- */
const profileData = key => (hl.profileOf(key) || {}).data || {};
const planOf = key => profileData(key).plan || {};
async function setPlan(key, patch){ const d = profileData(key); await hl.saveProfile(key, { ...d, plan: { ...(d.plan || {}), ...patch } }); }
const customs = kind => S.hl.templates.filter(x => x.kind === kind);
const tpl = (ref, kind) => tplOf(ref, kind, S.hl.templates);
const libFor = (kind, kid) => [...Object.entries(kind === "workout" ? WORKOUTS : DIETS).filter(([, x]) => !!x.kid === kid).map(([id]) => "b:" + id), ...customs(kind).map(c => "c:" + c.id)];

/* ---- 今日计划（概览左栏最上面也用） ---- */
function todayPlanHTML(who){
  const plan = planOf(who.key), w = plan.workout && tpl(plan.workout.tpl, "workout"), d = plan.diet && tpl(plan.diet.tpl, "diet");
  if (!w && !d) return `${secHead(t("今日计划"))}<div class="panel small muted">${t("还没有计划。")} <button class="chip" data-hl="view" data-v="plan">${t("看推荐，选一个")} ›</button></div>`;
  const acts = hl.dataOf(who.key).activity, today = S.day;
  const doneW = acts.filter(a => a.kind === "workout" && a.day === today);
  const wRow = w ? `<div class="hl-today-row"><span class="mi" aria-hidden="true">🏃</span><div class="mt"><b>${esc(L(w.x))}</b><small>${t("约 {n} 分钟", { n: w.x.minutes || 30 })} · ${workoutOn(plan, today) ? t("今天要练") : t("今天休息（想练也可以）")}</small></div>
      ${doneW.length ? `<span class="pill ok">✓ ${t("{n} 分钟", { n: doneW.reduce((s, a) => s + (+a.minutes || 0), 0) })}</span>` : S.hl.plansOk ? `<button class="btn primary hl-did" data-hl="wk-quick" data-ref="${esc(plan.workout.tpl)}">${t("今天照做了")}</button>` : ""}</div>` : "";
  const dRow = d ? `<div class="hl-today-row hl-meals"><span class="mi" aria-hidden="true">🥗</span><div class="mt"><b>${esc(L(d.x))}</b>${S.hl.plansOk ? mealButtons(who.key, today) : ""}</div></div>` : "";
  return `${secHead(t("今日计划"), `<button class="chip" data-hl="view" data-v="plan">${t("计划")} ›</button>`)}<div class="panel hl-today">${wRow}${dRow}</div>`;
}
const FOLLOW = [["yes", "照做", "✓"], ["partly", "部分", "◐"], ["no", "没照做", "✕"]];
function mealButtons(key, day){
  const acts = hl.dataOf(key).activity.filter(a => a.kind === "meal" && a.day === day);
  return `<div class="hl-meal-grid">${SLOTS.map(([slot, label]) => {
    const cur = acts.find(a => (a.data || {}).slot === slot), v = cur && cur.data.followed;
    return `<div class="hl-meal" role="group" aria-label="${esc(t(label))}"><span class="hl-meal-l">${t(label)}</span>${FOLLOW.map(([k, l, ic]) => `<button class="hl-mb ${k}" data-hl="meal" data-slot="${slot}" data-v="${k}" aria-pressed="${v === k}" title="${esc(t(l))}"><span aria-hidden="true">${ic}</span><span class="sr-only">${esc(t(l))}</span></button>`).join("")}</div>`;
  }).join("")}</div>`;
}

/* ---- 计划页：本周 · 当前计划 · 推荐（规则 + AI） ---- */
function planHTML(who){
  const key = who.key, data = hl.dataOf(key), prof = profileData(key), plan = prof.plan || {};
  const ws = weekStats({ activity: data.activity, today: S.day, kid: who.kid });
  const week = `${secHead(t("最近 7 天"))}<div class="panel hl-week">
    <div class="hl-bar-row"><span>${t("活动")}</span><div class="hl-bar" role="img" aria-label="${esc(t("{a} / {b} 分钟", { a: ws.minutes, b: ws.goal }))}"><i style="width:${ws.pct}%"></i></div><b class="num">${t("{a} / {b} 分钟", { a: ws.minutes, b: ws.goal })}</b></div>
    <div class="hl-bar-row"><span>${t("饮食照做")}</span><div class="hl-bar diet" role="img" aria-label="${esc(ws.mealPct == null ? t("还没记") : ws.mealPct + "%")}"><i style="width:${ws.mealPct || 0}%"></i></div><b class="num">${ws.mealPct == null ? t("还没记") : t("{p}%（{n} 餐）", { p: ws.mealPct, n: ws.meals })}</b></div>
    <p class="small muted" style="margin:6px 0 0">${who.kid ? t("孩子每天至少 60 分钟活动（WHO）。") : t("成人每周至少 150 分钟中等强度活动，另加 2 次力量训练（WHO / AHA）。")}</p></div>`;
  const w = plan.workout && tpl(plan.workout.tpl, "workout"), d = plan.diet && tpl(plan.diet.tpl, "diet");
  const days = plan.workout && plan.workout.days && plan.workout.days.length ? plan.workout.days : w ? w.x.days || [] : [];
  const cur = `${secHead(t("当前计划"))}<div class="hl-plan-cards">
    <div class="panel hl-plan-card"><div class="hl-pc-head"><span aria-hidden="true">🏃</span> <b>${w ? esc(L(w.x)) : t("还没选训练")}</b></div>
      ${w ? `<p class="small muted">${t("约 {n} 分钟", { n: w.x.minutes || 30 })} · ${days.map(x => t("周{d}", { d: t(WEEKDAY[x]) })).join(" ") || "—"}${plan.workout.remind !== false && plan.workout.time ? ` · ⏰ ${esc(plan.workout.time)}` : ""}</p>
      <div class="btns"><button class="btn" data-hl="tpl" data-kind="workout" data-ref="${esc(plan.workout.tpl)}">${t("看动作")}</button><button class="btn" data-hl="plan-sched">${t("日子和提醒")}</button><button class="btn" data-hl="view" data-v="workout">${t("换一个")}</button></div>`
        : `<div class="btns"><button class="btn" data-hl="view" data-v="workout">${t("去选")}</button></div>`}</div>
    <div class="panel hl-plan-card"><div class="hl-pc-head"><span aria-hidden="true">🥗</span> <b>${d ? esc(L(d.x)) : t("还没选饮食")}</b></div>
      ${d ? `<p class="small muted">${esc(L(d.x.summary) || d.x.summary || "")}</p>
      <div class="btns"><button class="btn" data-hl="tpl" data-kind="diet" data-ref="${esc(plan.diet.tpl)}">${t("看怎么吃")}</button>${(d.x.shop || []).length ? `<a class="btn" href="${esc(pantryLink((d.x.shop || []).map(L), L(d.x)))}" target="_blank" rel="noopener">🛒 ${t("加进爱家采购清单")} ↗</a>` : ""}<button class="btn" data-hl="view" data-v="diet">${t("换一个")}</button></div>`
        : `<div class="btns"><button class="btn" data-hl="view" data-v="diet">${t("去选")}</button></div>`}</div></div>`;
  return `${week}${cur}${recHTML(who, data, prof)}${aiHTML(who, prof)}`;
}
function recHTML(who, data, prof){
  const r = recommend({ data, profile: prof, kid: who.kid, today: S.day });
  const reason = x => { const v = { ...x.vars }; if (v.name) v.name = LABS[v.name] ? (lang() === "en" ? LABS[v.name].en : LABS[v.name].name) : v.name; if (v.f) v.f = t(v.f); return esc(t(x.k, v)); };
  const tags = Object.entries(r.tags);
  const basis = tags.length ? `<ul class="hl-basis">${tags.map(([tg, rs]) => `<li><b>${t(TAGS[tg] || tg)}</b>：${rs.slice(0, 3).map(reason).join("；")}</li>`).join("")}</ul>`
    : `<p class="small muted">${t("还没有异常的化验、体征或医生建议：先给通用的。记了就诊和化验以后，这里会按结果推荐。")}</p>`;
  const card = (kind, x) => { const tp = tpl("b:" + x.id, kind); if (!tp) return ""; const ref = "b:" + x.id, on = (planOf(who.key)[kind] || {}).tpl === ref;
    return `<div class="hl-rec"><button class="hl-rec-main" data-hl="tpl" data-kind="${kind}" data-ref="${ref}"><b>${kind === "workout" ? "🏃" : "🥗"} ${esc(L(tp.x))}</b><small>${x.hits.map(h => t(TAGS[h] || h)).join(" · ") || t("通用")}${kind === "workout" ? ` · ${t("约 {n} 分钟", { n: tp.x.minutes })}` : ""}</small></button>
      ${on ? `<span class="pill ok">✓ ${t("当前")}</span>` : `<button class="chip" data-hl="plan-set" data-kind="${kind}" data-ref="${ref}">${t("设为计划")}</button>`}</div>`; };
  return `${secHead(t("推荐"), "", t("按公开指南的规则"))}<div class="panel">${basis}
    <div class="hl-recs">${r.diets.map(x => card("diet", x)).join("")}${r.workouts.map(x => card("workout", x)).join("")}</div>
    <p class="small muted" style="margin:8px 0 0">${t("依据你记的化验、体征、档案和医生建议原文打标签；有慢病、怀孕、术后或医生另有交代的，以医生为准。")}</p></div>`;
}
function aiHTML(who, prof){
  const a = prof.ai;
  const res = a ? `<div class="hl-ai-res"><p class="small muted">${t("{d} 分析", { d: fmtDay(String(a.at).slice(0, 10)) })}</p>${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
    ${a.tips && a.tips.length ? `<b>${t("建议")}</b><ul>${a.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${a.cautions && a.cautions.length ? `<b>${t("复诊时可以问医生")}</b><ul>${a.cautions.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="btns">${a.diet && DIETS[a.diet] ? `<button class="chip" data-hl="plan-set" data-kind="diet" data-ref="b:${esc(a.diet)}">🥗 ${t("用 {n}", { n: L(DIETS[a.diet]) })}</button>` : ""}${a.workout && WORKOUTS[a.workout] ? `<button class="chip" data-hl="plan-set" data-kind="workout" data-ref="b:${esc(a.workout)}">🏃 ${t("用 {n}", { n: L(WORKOUTS[a.workout]) })}</button>` : ""}</div></div>` : "";
  return `${secHead(t("让咩咩咩分析"), "", "AI")}<div class="panel">${res}
    <div class="btns" style="margin-top:${a ? 8 : 0}px"><button class="btn ${a ? "" : "primary"}" data-hl="ai-plan" ${S.hlAiBusy ? "disabled" : ""}>${S.hlAiBusy ? t("分析中…") : a ? t("重新分析") : t("分析并推荐")}</button></div>
    <p class="small muted" style="margin:6px 0 0">${aiReady() ? t("发给你自己设置的 AI：年龄、性别、最近的体征、化验、病史、目标和医生建议原文；不发姓名。结果只是建议，采纳以后才变成计划。") : t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")}</p></div>`;
}

/* ---- 训练页 ---- */
function workoutHTML(who){
  const key = who.key, data = hl.dataOf(key), plan = planOf(key);
  const list = libFor("workout", who.kid).map(ref => ({ ref, tp: tpl(ref, "workout") })).filter(x => x.tp);
  const lib = `<div class="panel mlist">${list.map(({ ref, tp }) => `<button class="mrow" data-hl="tpl" data-kind="workout" data-ref="${esc(ref)}"><span class="mi" aria-hidden="true">${tp.src === "c" ? "✎" : "🏃"}</span>
    <span class="mt"><b>${esc(L(tp.x))}${(plan.workout || {}).tpl === ref ? ` <span class="pill ok">${t("当前")}</span>` : ""}</b><small>${t("约 {n} 分钟", { n: tp.x.minutes || 30 })} · ${levelDots(tp.x.level || 1)} · ${(tp.x.tags || []).filter(x => TAGS[x]).map(x => t(TAGS[x])).join(" · ")}</small></span><span class="mch" aria-hidden="true">›</span></button>`).join("")}</div>`;
  const logs = data.activity.filter(a => a.kind === "workout").sort((a, b) => b.day.localeCompare(a.day));
  const hist = logs.length ? `<div class="panel mlist">${pg.page("hlWk", logs).map(a => { const tp = tpl(a.template, "workout"); return `<button class="mrow" data-hl="wk-edit" data-id="${esc(a.id)}"><span class="mi" aria-hidden="true">✓</span>
      <span class="mt"><b>${esc(tp ? L(tp.x) : t("自由训练"))} · ${t("{n} 分钟", { n: a.minutes || 0 })}</b><small>${fmtDay(a.day)}${(a.data || {}).note ? ` · ${esc(a.data.note)}` : ""}</small></span><span class="mch" aria-hidden="true">›</span></button>`; }).join("")}</div>${pg.moreBtn("hlWk", logs.length)}`
    : `<div class="panel small muted">${t("还没有训练记录。")}</div>`;
  return `${S.hl.plansOk ? "" : noTables()}${secHead(t("训练模版"), S.hl.plansOk ? `<button class="chip" data-hl="tpl-new" data-kind="workout">＋ ${t("自己建一个")}</button>` : "")}${lib}
    ${secHead(t("训练记录"), S.hl.plansOk ? `<button class="chip" data-hl="wk-new">＋ ${t("记一次")}</button>` : "")}${hist}
    <p class="small muted">${who.key === "u:" + S.user.id ? t("给自己记的训练会同时计入「锻炼」习惯的分钟（如果建了这个习惯）。") : ""}</p>`;
}

/* ---- 饮食页 ---- */
function dietHTML(who){
  const key = who.key, data = hl.dataOf(key), plan = planOf(key), d = plan.diet && tpl(plan.diet.tpl, "diet");
  const list = libFor("diet", who.kid).map(ref => ({ ref, tp: tpl(ref, "diet") })).filter(x => x.tp);
  const today = d && S.hl.plansOk ? `${secHead(t("今天"), "", esc(L(d.x)))}<div class="panel">${mealButtons(key, S.day)}<p class="small muted" style="margin:8px 0 0">${t("每餐点一下：✓ 照做、◐ 部分、✕ 没照做；再点一次取消。不记热量。")}</p></div>` : "";
  // 最近 7 天的格子：行 = 餐次，列 = 天
  const days = [...Array(7)].map((_, i) => wb.dayAdd(S.day, i - 6));
  const meals = data.activity.filter(a => a.kind === "meal");
  const cell = (day, slot) => { const m = meals.find(a => a.day === day && (a.data || {}).slot === slot), v = m && m.data.followed; return `<td class="hl-g ${v || ""}" title="${esc(fmtDay(day))}">${v ? FOLLOW.find(f => f[0] === v)[2] : "·"}</td>`; };
  const grid = d && meals.length ? `<div class="panel scroll-x"><table class="hl-grid7"><caption class="sr-only">${t("最近 7 天的饮食")}</caption><thead><tr><th></th>${days.map(x => `<th scope="col">${t("周{d}", { d: t(WEEKDAY[new Date(x + "T12:00:00").getDay()]) })}</th>`).join("")}</tr></thead>
    <tbody>${SLOTS.map(([slot, label]) => `<tr><th scope="row">${t(label)}</th>${days.map(x => cell(x, slot)).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  const lib = `<div class="panel mlist">${list.map(({ ref, tp }) => `<button class="mrow" data-hl="tpl" data-kind="diet" data-ref="${esc(ref)}"><span class="mi" aria-hidden="true">${tp.src === "c" ? "✎" : "🥗"}</span>
    <span class="mt"><b>${esc(L(tp.x))}${(plan.diet || {}).tpl === ref ? ` <span class="pill ok">${t("当前")}</span>` : ""}</b><small>${esc(L(tp.x.summary) || "")}</small></span><span class="mch" aria-hidden="true">›</span></button>`).join("")}</div>`;
  return `${S.hl.plansOk ? "" : noTables()}${today}${grid}${secHead(t("饮食模版"), S.hl.plansOk ? `<button class="chip" data-hl="tpl-new" data-kind="diet">＋ ${t("自己建一个")}</button>` : "")}${lib}
    ${who.kid ? `<p class="small muted">${t("孩子按餐盘法，不数热量、不说减重。")}</p>` : ""}`;
}

/* ---- 模版详情（整页） ---- */
function openTpl(kind, ref){
  const tp = tpl(ref, kind); if (!tp) return;
  const x = tp.x, key = UI().who, on = (planOf(key)[kind] || {}).tpl === ref;
  const acts = `<div class="btns">${on ? `<span class="pill ok">✓ ${t("当前计划")}</span>` : `<button class="btn primary" data-hl="plan-set" data-kind="${kind}" data-ref="${esc(ref)}">${t("设为计划")}</button>`}
    ${kind === "workout" && S.hl.plansOk ? `<button class="btn" data-hl="wk-quick" data-ref="${esc(ref)}">${t("今天照做了")}</button>` : ""}
    ${kind === "diet" && (x.shop || []).length ? `<a class="btn" href="${esc(pantryLink(x.shop.map(L), L(x)))}" target="_blank" rel="noopener">🛒 ${t("加进爱家采购清单")} ↗</a>` : ""}
    ${S.hl.plansOk ? `<button class="btn" data-hl="tpl-copy" data-kind="${kind}" data-ref="${esc(ref)}">${tp.src === "c" ? t("编辑") : t("复制后改成自己的")}</button>` : ""}</div>`;
  const li = arr => `<ul>${(arr || []).map(v => `<li>${esc(L(v) || v)}</li>`).join("")}</ul>`;
  const body = kind === "workout"
    ? `<p class="muted">${t("约 {n} 分钟", { n: x.minutes || 30 })} · ${levelDots(x.level || 1)}</p>${x.note ? `<p class="notice-soft">${esc(L(x.note))}</p>` : ""}<ol class="hl-steps">${(x.items || []).map(it => `<li>${esc(itemText(it))}</li>`).join("")}</ol>`
    : `${x.summary ? `<p>${esc(L(x.summary) || x.summary)}</p>` : ""}<h3>${t("怎么吃")}</h3>${li(x.rules)}${(x.limit || []).length ? `<h3>${t("少吃")}</h3>${li(x.limit)}` : ""}
      <h3>${t("一天的例子")}</h3><dl class="hl-day">${SLOTS.map(([s, l]) => ((x.meals || {})[s] || []).length ? `<dt>${t(l)}</dt><dd>${(x.meals[s]).map(v => esc(L(v) || v)).join("；")}</dd>` : "").join("")}</dl>
      ${(x.shop || []).length ? `<h3>${t("常买")}</h3><p>${x.shop.map(v => esc(L(v) || v)).join("、")}</p>` : ""}`;
  openInfo(L(x), `${body}${acts}<p class="small muted">${t("模版是起点，不是处方；有慢病、怀孕、术后或医生另有交代的，以医生为准。")}</p>`);
}
/* 自建 / 复制模版：一行一项 */
const parseItem = line => { const m = String(line).match(/^(.*?)[\s·]+(\d+)\s*[×xX*]\s*(\d+)\s*(秒|s|sec)?\s*$/); if (m) return m[4] ? { zh: m[1], en: m[1], sets: +m[2], sec: +m[3] } : { zh: m[1], en: m[1], sets: +m[2], reps: +m[3] };
  const n = String(line).match(/^(.*?)[\s·]+(\d+)\s*(分钟|min|分)\s*$/); if (n) return { zh: n[1], en: n[1], min: +n[2] }; return { zh: line, en: line }; };
const lines = v => String(v || "").split(/\n/).map(s => s.trim()).filter(Boolean);
function openTplForm(kind, ref){
  const base = ref ? tpl(ref, kind) : null, mine = base && base.src === "c" ? S.hl.templates.find(r => r.id === base.id) : null, x = base ? base.x : {};
  const tl = v => (v ? L(v) || v : "");
  const init = kind === "workout"
    ? { name: mine ? mine.name : base ? t("{n}（我的）", { n: L(x) }) : "", minutes: x.minutes || 30, level: String(x.level || 1), items: (x.items || []).map(it => itemText(it).replace(/ · (\d+)×/, " $1×")).join("\n"), tags: x.tags || [] }
    : { name: mine ? mine.name : base ? t("{n}（我的）", { n: L(x) }) : "", summary: tl(x.summary), rules: (x.rules || []).map(tl).join("\n"), limit: (x.limit || []).map(tl).join("\n"),
        breakfast: ((x.meals || {}).breakfast || []).map(tl).join("；"), lunch: ((x.meals || {}).lunch || []).map(tl).join("；"), dinner: ((x.meals || {}).dinner || []).map(tl).join("；"), snack: ((x.meals || {}).snack || []).map(tl).join("；"), shop: (x.shop || []).map(tl).join("、"), tags: x.tags || [] };
  const tagOpts = Object.entries(TAGS).filter(([k]) => (kind === "workout" ? !["iron"].includes(k) : !["cardio", "strength", "flex", "gentle"].includes(k)));
  const fields = kind === "workout" ? [
    { k: "name", label: "名称", type: "text" }, { k: "minutes", label: "大约几分钟", type: "num" },
    { k: "level", label: "难度", type: "seg", opts: [["1", "容易"], ["2", "中等"], ["3", "较难"]] },
    { k: "items", label: "动作（一行一个）", type: "area", rows: 6, ph: "深蹲 3×12\n平板支撑 3×30秒\n快走 20分钟", hint: "写成「名称 组数×次数」「名称 组数×秒数秒」或「名称 分钟数分钟」" },
    { k: "tags", label: "适合", type: "multi", opts: tagOpts }
  ] : [
    { k: "name", label: "名称", type: "text" }, { k: "summary", label: "一句话说明", type: "text" },
    { k: "rules", label: "怎么吃（一行一条）", type: "area", rows: 4 }, { k: "limit", label: "少吃（一行一条）", type: "area", rows: 3 },
    { k: "breakfast", label: "早餐例子", type: "text" }, { k: "lunch", label: "午餐例子", type: "text" }, { k: "dinner", label: "晚餐例子", type: "text" }, { k: "snack", label: "加餐例子", type: "text" },
    { k: "shop", label: "常买（用顿号或逗号隔开）", type: "area", rows: 2, hint: "可以一键加进爱家小助手的采购清单" },
    { k: "tags", label: "适合", type: "multi", opts: tagOpts }
  ];
  openForm(mine ? "编辑模版" : "自己的模版", fields, init, async f => {
    if (!f.name) { toast(t("请填名称")); return; }
    const split = v => String(v || "").split(/[、，,;；]/).map(s => s.trim()).filter(Boolean);
    const data = kind === "workout" ? { minutes: f.minutes || 30, level: +f.level || 1, tags: f.tags || [], items: lines(f.items).map(parseItem) }
      : { summary: f.summary || "", tags: f.tags || [], rules: lines(f.rules), limit: lines(f.limit), meals: { breakfast: split(f.breakfast), lunch: split(f.lunch), dinner: split(f.dinner), snack: split(f.snack) }, shop: split(f.shop) };
    const row = await hl.save("templates", { ...(mine ? { id: mine.id } : {}), kind, name: f.name.slice(0, 80), data });
    closeSheet(); toast(t("已保存")); openTpl(kind, "c:" + row.id);
  }, mine ? async () => {
    if (!confirm(t("删除这个模版？用它的计划会变成没选。"))) return;
    await hl.remove("templates", mine.id); closeSheet(); toast(t("已删除"));
  } : null);
}

/* ---- 记训练 ---- */
const me = () => "u:" + S.user.id;
async function linkExercise(minutes, name, day){
  const p = wb.firstOfKind("exercise"); if (!p) return null;
  try { const l = await wb.addLog("exercise", p.id, { minutes, type: "力量", note: name }, day); return l.id; } catch (e) { return null; }
}
async function unlinkExercise(id){ if (id && S.wb.logs.some(l => l.id === id)) { try { await wb.deleteLog(id); } catch (e) { /* 打卡已经删了也没关系 */ } } }
async function quickWorkout(ref){
  const key = UI().who, tp = tpl(ref, "workout"); if (!tp) return;
  const minutes = tp.x.minutes || 30, data = {};
  if (key === me()) data.wb_log = await linkExercise(minutes, L(tp.x), S.day);
  await hl.save("activity", { subject: key, day: S.day, kind: "workout", template: ref, minutes, data });
  closeSheet(); toast(data.wb_log ? t("记了 {n} 分钟，也计入了「锻炼」", { n: minutes }) : t("记了 {n} 分钟", { n: minutes }));
}
function openWorkoutLog(a){
  const key = UI().who, plan = planOf(key), refs = libFor("workout", (hl.person(key) || {}).kid);
  const init = a ? { day: a.day, template: a.template, minutes: a.minutes, note: (a.data || {}).note || "" } : { day: S.day, template: (plan.workout || {}).tpl || refs[0], minutes: null, note: "" };
  openForm(a ? "编辑训练" : "记一次训练", [
    { k: "day", label: "日期", type: "date" },
    { k: "template", type: "html", html: d => `<div class="field" style="margin:0"><label for="f_tpl">${t("模版")}</label><select id="f_tpl" data-f="template"><option value="" ${!d.template ? "selected" : ""}>${t("自由训练（不按模版）")}</option>${refs.map(r => { const tp = tpl(r, "workout"); return `<option value="${esc(r)}" ${d.template === r ? "selected" : ""}>${esc(L(tp.x))}</option>`; }).join("")}</select></div>` },
    { k: "minutes", label: "多少分钟", type: "num", ph: "30", hint: "不填就按模版的分钟数" },
    { k: "note", label: "备注", type: "text", ph: "跑了 3 公里 / 膝盖有点疼" }
  ], init, async f => {
    const tp = f.template ? tpl(f.template, "workout") : null, minutes = f.minutes || (tp ? tp.x.minutes : 0);
    if (!f.day || !minutes) { toast(t("请填日期和分钟数")); return; }
    const data = { ...((a && a.data) || {}), note: f.note || "" };
    if (!a && key === me()) data.wb_log = await linkExercise(minutes, tp ? L(tp.x) : f.note || t("训练"), f.day);
    else if (a && data.wb_log && S.wb.logs.some(l => l.id === data.wb_log)) { try { await wb.updateLog(data.wb_log, { minutes, type: "力量", note: tp ? L(tp.x) : f.note }); } catch (e) { /* 只是没同步打卡 */ } }
    await hl.save("activity", { ...(a ? { id: a.id } : {}), subject: key, day: f.day, kind: "workout", template: f.template || "", minutes, data });
    closeSheet(); toast(t("已保存"));
  }, a ? async () => { if (!confirm(t("删除这次训练？「锻炼」里对应的那次打卡也一起删。"))) return; await unlinkExercise((a.data || {}).wb_log); await hl.remove("activity", a.id); closeSheet(); toast(t("已删除")); } : null);
}
/* ---- 记饮食：每餐一下；再点同一个 = 取消 ---- */
async function logMeal(slot, v){
  const key = UI().who, plan = planOf(key), day = S.day;
  const cur = S.hl.activity.find(a => a.subject === key && a.kind === "meal" && a.day === day && (a.data || {}).slot === slot);
  if (cur && cur.data.followed === v) { await hl.remove("activity", cur.id); render(); return; }
  await hl.save("activity", { ...(cur ? { id: cur.id } : {}), subject: key, day, kind: "meal", template: (plan.diet || {}).tpl || "", minutes: null, data: { ...((cur && cur.data) || {}), slot, followed: v } });
  render();
}
/* ---- 计划的日子和提醒 ---- */
function openSchedule(){
  const key = UI().who, plan = planOf(key), w = plan.workout && tpl(plan.workout.tpl, "workout"); if (!w) return;
  const days = plan.workout.days && plan.workout.days.length ? plan.workout.days : w.x.days || [];
  openForm("训练的日子和提醒", [
    { k: "days", label: "哪几天", type: "multi", opts: [1, 2, 3, 4, 5, 6, 0].map(d => [d, t("周{d}", { d: t(WEEKDAY[d]) })]), raw: true },
    { k: "time", label: "几点提醒", type: "time" },
    { k: "remind", label: "放进日历订阅提醒", type: "check", hint: "我的 → 日历订阅提醒；自己和孩子的训练会出现在你的日历里" }
  ], { days: days.map(String), time: plan.workout.time || "18:00", remind: plan.workout.remind !== false }, async f => {
    await setPlan(key, { workout: { ...plan.workout, days: (f.days || []).map(Number), time: f.time || "", remind: !!f.remind } });
    closeSheet(); toast(t("已保存"));
  });
}
/* ---- AI 分析 ---- */
const AI_OK = LS_PREFIX + ".hlAiOk";
async function aiPlan(){
  if (!aiReady()) { toast(t("先在 我的 → 咩咩咩 → AI 设置 里填一个 API key")); return; }
  if (!loadJSON(AI_OK, false)) {
    if (!confirm(t("会把年龄、性别、最近的体征、化验、病史、目标和医生建议原文发给你自己设置的 AI 服务商（不发姓名）。继续吗？"))) return;
    saveJSON(AI_OK, true);
  }
  const key = UI().who, who = hl.person(key), prof = profileData(key);
  const ids = { diets: Object.keys(DIETS).filter(k => !!DIETS[k].kid === who.kid), workouts: Object.keys(WORKOUTS).filter(k => !!WORKOUTS[k].kid === who.kid) };
  S.hlAiBusy = true; render();
  try {
    const out = parsePlanAI(await askText(AI_PLAN_SYSTEM(lang(), ids), JSON.stringify(aiSummary({ data: hl.dataOf(key), profile: prof, kid: who.kid, today: S.day })), { json: true, maxTokens: 1500 }), ids);
    if (!out) throw new Error(t("AI 返回的格式不对，再试一次"));
    await hl.saveProfile(key, { ...profileData(key), ai: { ...out, at: new Date().toISOString() } });
    toast(t("分析好了"));
  } catch (e) { toast(t("分析失败：{msg}", { msg: String(e.message || e).slice(0, 100) })); }
  finally { S.hlAiBusy = false; renderBg(); }
}

/* ---- 事件（health.js 的 hlAct 把这些转过来）；返回 true = 处理了 ---- */
async function planAct(act, d){
  switch (act) {
    case "tpl": openTpl(d.kind, d.ref); return true;
    case "tpl-new": openTplForm(d.kind, null); return true;
    case "tpl-copy": openTplForm(d.kind, d.ref); return true;
    case "plan-set": {
      const key = UI().who, tp = tpl(d.ref, d.kind); if (!tp) return true;
      if (d.kind === "workout") { const cur = planOf(key).workout || {}; await setPlan(key, { workout: { tpl: d.ref, name: L(tp.x), days: tp.x.days || [], time: cur.time || "18:00", remind: cur.remind !== false } }); }   // name：日历订阅的事件标题用
      else await setPlan(key, { diet: { tpl: d.ref, since: S.day } });
      closeSheet(); toast(t("已设为计划：{n}", { n: L(tp.x) })); return true;
    }
    case "plan-sched": openSchedule(); return true;
    case "wk-quick": await quickWorkout(d.ref); return true;
    case "wk-new": openWorkoutLog(null); return true;
    case "wk-edit": { const a = S.hl.activity.find(x => x.id === d.id); if (a) openWorkoutLog(a); return true; }
    case "meal": await logMeal(d.slot, d.v); return true;
    case "ai-plan": await aiPlan(); return true;
  }
  return false;
}

export { todayPlanHTML, planHTML, workoutHTML, dietHTML, planAct };
