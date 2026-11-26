import { familyHTML } from "./core/auth.js";
import { aiReady, aiSettings, providerOf } from "./ai.js";
import { APP_VERSION, ICS_FUNCTION, LS_PREFIX, SISTER_APPS, THIS_APP } from "./core/config.js";
import { LOCALES, locale, t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, dayKey, esc } from "./core/util.js";
import { ALL_DAYS, KINDS, WEEKDAY, kindOf, modeOf } from "./data/kinds.js";
import { PLANS } from "./data/plans.js";
import { SIZES as PAGE_SIZES, pageSize } from "./pager.js";
import { fbar } from "./ui.js";
import { fieldsHtml } from "./form-fields.js";
import { formBar, formMenu } from "./shared/ui-form.js";
import { render } from "./views.js";
import { usageHTML } from "./usage.js";
import * as wb from "./wb.js";
import * as tk from "./tk.js";

/* ============ 整页表单（替换内容区，和家庭学堂一样的交互） ============ */
let sheetScrollY = 0;
function showSheet(){
  const d = $("#sheet");
  if (!d.open) {
    sheetScrollY = window.scrollY;
    try { history.scrollRestoration = "manual"; history.pushState({ sheet: 1 }, ""); } catch (e) {}
    d.show();
    document.body.classList.add("sheet-open");
  }
  window.scrollTo(0, 0);
  const first = d.querySelector(".sheet-head h3"); if (first) { first.tabIndex = -1; first.focus({ preventScroll: true }); }
}
function restoreScroll(){ const y = sheetScrollY, go = () => window.scrollTo(0, y); go(); setTimeout(go, 0); requestAnimationFrame(() => { go(); requestAnimationFrame(go); }); }
function closeSheet(){
  const d = $("#sheet");
  if (!d.open) { render(); return; }
  d.close();
  document.body.classList.remove("sheet-open");
  render();
  restoreScroll();
  if (history.state && history.state.sheet) { try { history.back(); } catch (e) {} }
}
$("#sheet").addEventListener("close", () => { if (document.body.classList.contains("sheet-open")) { document.body.classList.remove("sheet-open"); render(); restoreScroll(); } });
window.addEventListener("popstate", () => closeSheet());
// 页头只有标题、额外按钮（extra）和可选的右上角 ⋯ 菜单（menu）；没有顶部关闭按钮：表单底部有「取消」，其他面板底部由 ensureCloseBar 补一个「关闭」
const head = (title, extra = "", menu = "") => `<div class="sheet-head"><h3 id="sheetTitle">${title}</h3><span>${extra}${menu}</span></div>`;
const closeBarHtml = () => formBar("edit", [{ role: "cancel", label: t("关闭"), attrs: 'data-act="close"' }]);
/** 面板内容一换，如果底部没有操作条（表单自带取消 / 保存；预览、结果页有自己的「返回」按钮条，带 noprint），就补一条「关闭」 */
const sheetIn = $("#sheetIn");
new MutationObserver(() => {
  if (!sheetIn.children.length || sheetIn.querySelector(".ui-formbar") || sheetIn.querySelector(":scope > .noprint")) return;
  sheetIn.insertAdjacentHTML("beforeend", closeBarHtml());
}).observe(sheetIn, { childList: true });

/* ---- 通用小表单：spec 描述字段，保存时把 draft 交给 onSave ---- */
let form = null;
function openForm(title, fields, values, onSave, onDelete){
  form = { title, fields, draft: { ...values }, onSave, onDelete };
  drawForm(); showSheet();
}
function drawForm(){
  const { title, fields, draft, onDelete } = form;
  const html = fieldsHtml(fields, draft);
  const menu = onDelete ? formMenu([{ label: t("删除"), attrs: 'data-act="form-delete"', tone: "danger" }], { label: t("更多操作") }) : "";   // 删除不常用：放页头右上角 ⋯
  $("#sheetIn").innerHTML = `${head(esc(t(title)), "", menu)}${html}
    ${formBar("edit", [{ role: "cancel", label: t("取消"), attrs: 'data-act="close"' }, { role: "save", label: t("保存"), attrs: 'data-act="form-save"' }])}`;
}
function readForm(){
  $("#sheetIn").querySelectorAll("[data-f]").forEach(el => {
    const k = el.dataset.f;
    if (el.type === "checkbox") form.draft[k] = el.checked;
    else if (el.type === "number") form.draft[k] = el.value === "" ? null : +el.value;
    else form.draft[k] = el.value.trim();
  });
}
function getForm(){ return form; }
function openInfo(title, html){ $("#sheetIn").innerHTML = `${head(esc(t(title)))}${html}`; showSheet(); }

/* ---- 习惯表单：表里的 target / schedule / meta 展平成一张表，保存时再折回去 ---- */
const weekdayOpts = () => [1, 2, 3, 4, 5, 6, 0].map(d => [d, t("周{d}", { d: t(WEEKDAY[d]) })]);
const kindOpts = () => Object.entries(KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`]);
const fh = title => `<div class="fh">${t(title)}</div>`;   // 表单里的分段小标题
function practiceFields(){
  const is = (...ks) => d => ks.includes(d.kind), notMed = d => !["med", "supplement"].includes(d.kind);   // 用药不用时间点和日历提醒：只填最短间隔
  /* 版式：数字类写成一行「前缀 [框] 后缀」（pre / suf），同类两项在电脑上并排（w: "m" = 半行，手机单列）；
     选项少的用 ui-seg 一排（fill），选项多的用下拉（sel） */
  return [
    { k: "h_basic", type: "html", html: () => fh("基本信息") },
    { k: "kind", label: "种类", type: "sel", redraw: true, opts: kindOpts(), when: d => !d.id, w: "m" },
    { k: "name", label: "名称", type: "text", ph: "读经 / 晨跑 / 维生素 D", w: "m", when: d => !d.id },   // 新建：和「种类」下拉并排；编辑（没有种类下拉）：整行
    { k: "name", label: "名称", type: "text", ph: "读经 / 晨跑 / 维生素 D", when: d => !!d.id },
    { k: "h_goal", type: "html", html: () => fh("目标"), when: is("exercise", "custom", "prayer", "focus", "screen", "sleep") },
    { k: "per", label: "目标按", type: "seg", fill: true, opts: [["day", "每天"], ["week", "每周"]], when: is("exercise", "custom") },
    { k: "count", pre: "每周", suf: "次", type: "num", ph: "3", when: d => d.per === "week" && ["exercise", "custom"].includes(d.kind), w: "m" },
    { k: "count", pre: "每天", suf: "次", type: "num", ph: "1", when: is("prayer"), w: "m" },
    { k: "count", pre: "每天", suf: "段", type: "num", ph: "4", hint: "专注计时器自动记录，这里只是目标。", when: is("focus") },
    { k: "minutes", pre: "每次", suf: "分钟（可空）", type: "num", ph: "30", when: is("exercise", "custom"), w: "m" },
    { k: "max", pre: "每天最多", suf: "分钟", type: "num", ph: "120", when: is("screen") },
    { k: "min", pre: "每晚希望睡", suf: "小时", type: "num", ph: "7", step: 0.5, when: is("sleep") },
    { k: "h_dose", type: "html", html: () => fh("剂量与库存"), when: is("med", "supplement") },
    { k: "dose", label: "剂量", type: "text", ph: "1 片 / 2 粒", when: is("med", "supplement"), w: "m" },
    { k: "hours", pre: "最短间隔", suf: "小时", type: "num", ph: "6", step: 0.5, hint: "按医嘱；填了今天页的药卡会显示下次可以服药的时间。", when: is("med", "supplement"), w: "m" },
    { k: "timing", label: "服药时机（按医嘱 / 说明书）", type: "sel", redraw: true, opts: [["", "不限"], ["空腹", "空腹"], ["饭前", "饭前"], ["饭后", "饭后"], ["随餐", "随餐"], ["睡前", "睡前"]], when: is("med", "supplement"), w: "m" },
    { k: "mins", pre: "饭前 / 饭后", suf: "分钟", type: "num", ph: "30", when: d => ["med", "supplement"].includes(d.kind) && ["饭前", "饭后"].includes(d.timing), w: "m" },
    { k: "mednote", label: "医嘱备注", type: "text", ph: "如：胃不舒服就停、吃完这盒", when: is("med", "supplement") },
    { k: "stock", pre: "现在还剩", suf: "（可空）", type: "num", ph: "30", hint: "每次“服了”自动减一。", when: is("med", "supplement"), w: "m" },
    { k: "refillAt", pre: "剩", suf: "天的量时提醒补货", type: "num", ph: "7", when: is("med", "supplement"), w: "m" },
    { k: "hero", label: "在今天首页顶部显示「距上次」大卡片（病好了可以关掉）", type: "check", when: is("med", "supplement") },
    { k: "h_time", type: "html", html: () => fh("日子与提醒"), when: notMed },
    { k: "days", label: "哪几天", type: "multi", fill: true, raw: true, opts: weekdayOpts(), hint: "按周算目标的习惯，哪天做都算；这里的日子只决定提醒。", when: notMed },
    { k: "times", label: "时间点（提醒用，多个用逗号隔开）", type: "text", ph: "07:00, 21:30", when: notMed },
    { k: "remind", label: "进日历订阅提醒", type: "check", when: notMed },
    { k: "h_share", type: "html", html: () => fh("分享与状态") },
    { k: "share", label: "完成情况开给家人看", type: "seg", fill: true, opts: [["private", "仅自己"], ["family", "家人可见"]], hint: "家人只看到这项做了没有、分钟数和备注。祷告清单的内容永远只有你自己看得到。" },
    { k: "active", label: "进行中", type: "check" }
  ];
}
function practiceToDraft(p){
  const tg = p.target || {}, sc = p.schedule || {}, m = p.meta || {};
  return { id: p.id || null, kind: p.kind || "custom", name: p.name || "", per: tg.per || (p.kind === "exercise" ? "week" : "day"), count: tg.count ?? null, minutes: tg.minutes ?? null, max: tg.max ?? null, min: tg.min ?? null,
    dose: m.dose || "", hours: m.hours ?? null, stock: m.stock ?? null, refillAt: m.refillAt ?? null, hero: m.hero ?? p.kind === "med", timing: m.timing || "", mins: m.mins ?? null, mednote: m.note || "", days: sc.days || ALL_DAYS, times: (sc.times || []).join(", "), remind: sc.remind !== false, share: p.share || "private", active: p.active !== false, archived: !!p.archived };
}
function draftToPractice(d){
  const times = String(d.times || "").split(/[,，;；\s]+/).map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^(\d{1,2}):?(\d{2})$/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; }).filter(Boolean).sort();
  const per = ["exercise", "custom"].includes(d.kind) ? (d.per || "day") : "day", med = ["med", "supplement"].includes(d.kind);
  return { id: d.id || undefined, kind: d.kind, name: d.name, target: { per, count: d.count || null, minutes: d.minutes || null, max: d.max || null, min: d.min || null },
    schedule: { days: (d.days || []).map(Number), times: med ? [] : times, remind: med ? false : !!d.remind }, meta: { dose: d.dose || "", hours: med ? d.hours || null : null, stock: d.stock, refillAt: d.refillAt, timing: d.timing || "", mins: ["饭前", "饭后"].includes(d.timing) ? d.mins || null : null, note: d.mednote || "", hero: d.hero !== false && !!d.hero }, share: d.share, active: d.active !== false, archived: !!d.archived };
}
function openPractice(p){
  const isNew = !p || !p.id;
  const draft = practiceToDraft(p || { kind: "custom", schedule: { days: ALL_DAYS, times: [], remind: true } });
  // 名字可以留空：界面按种类显示（跟随界面语言）
  openForm(isNew ? "新习惯" : "编辑习惯", practiceFields(), draft,
    async f => { await wb.upsertPractice(draftToPractice(f)); openHabits(); },
    isNew ? null : async () => {
      const cur = wb.practice(p.id);
      if (!cur.archived) { await wb.upsertPractice({ ...cur, archived: true, active: false }); openHabits(); return; }
      if (confirm(t("彻底删除这项和它的全部打卡记录？"))) { await wb.deletePractice(p.id); openHabits(); }
    });
}
/* 习惯列表：一行筛选（全部 / 习惯与提醒 / 用药与保健品 / 已归档）+ 同一行的“新增”；每行可编辑，可直接切换“家人可见” */
const isMed = p => ["med", "supplement"].includes(p.kind);
function lowStock(p){ const m = p.meta || {}; if (!isMed(p) || m.stock == null || m.stock === "" || m.refillAt == null || m.refillAt === "") return false; return Math.floor(m.stock / Math.max(1, ((p.schedule || {}).times || []).length)) <= m.refillAt; }
function openHabits(filter){
  S.habitsFilter = filter && ["all", "habits", "meds", "archived"].includes(filter) ? filter : (S.habitsFilter || "all");
  const all = S.wb.practices, f = S.habitsFilter, q = (S.habitsQ || "").trim().toLowerCase();
  const match = p => !q || `${p.name || t(kindOf(p).label)} ${t(kindOf(p).label)} ${(p.meta || {}).dose || ""}`.toLowerCase().includes(q);
  const live = all.filter(p => !p.archived);
  const groups = { all: live, habits: live.filter(p => !isMed(p)), meds: live.filter(isMed), archived: all.filter(p => p.archived) };
  const list = groups[f].filter(match);
  const daysLeft = p => { const m = p.meta || {}, n = Math.max(1, ((p.schedule || {}).times || []).length); return Math.floor(m.stock / n); };
  /* 每行：图标 | 名字（暂停 / 补货提示）+ 目标一行 + 小标签（日子、时间点）| 家人可见开关 */
  const row = p => { const k = kindOf(p), tg = p.target || {}, sc = p.schedule || {}, m = p.meta || {};
    const goal = p.kind === "focus" ? t("每天 {n} 段", { n: tg.count || "–" }) : modeOf(p) === "minutes" ? (tg.per === "week" ? t("每周 {n} 次 · 每次 {m} 分钟", { n: tg.count || 1, m: tg.minutes || "–" }) : t("每天 {m} 分钟", { m: tg.minutes || "–" }))
      : p.kind === "screen" ? t("每天不超过 {m} 分钟", { m: tg.max || "–" }) : p.kind === "sleep" ? t("每晚 {h} 小时", { h: tg.min || "–" }) : p.kind === "prayer" ? t("每天 {n} 次", { n: tg.count || 1 })
      : isMed(p) ? esc(m.dose || "") : "";
    const stock = isMed(p) && m.stock != null && m.stock !== "" ? `${t("剩 {n}", { n: m.stock })}${(sc.times || []).length ? ` · ${t("约 {d} 天", { d: daysLeft(p) })}` : ""}` : "";
    const days = (sc.days || ALL_DAYS).length === 7 ? t("每天") : (sc.days || []).map(d => t(WEEKDAY[d])).join("");
    const tags = [isMed(p) ? "" : days, isMed(p) && +m.hours > 0 ? t("至少隔 {n} 小时", { n: m.hours }) : "", sc.times && sc.times.length ? sc.times.join(" ") + (sc.remind === false ? "" : " ⏰") : ""].filter(Boolean).map(x => `<span class="ui-badge" data-tone="neutral" data-outline>${esc(x)}</span>`).join("");
    return `<div class="habit hrow ${p.active === false && !p.archived ? "paused" : ""}"><span class="hi" style="background:${k.color}22;color:${k.color}">${k.icon}</span>
      <button class="main" data-act="habit-edit" data-pid="${esc(p.id)}"><span class="title">${esc(p.name || t(k.label))}${p.active === false && !p.archived ? ` <span class="ui-badge" data-tone="neutral">${t("暂停")}</span>` : ""}${!p.archived && lowStock(p) ? ` <span class="warn">${t("该补货了")}</span>` : ""}</span>
        ${goal || stock ? `<span class="meta">${[goal, stock].filter(Boolean).join(" · ")}</span>` : ""}${tags ? `<span class="tags">${tags}</span>` : ""}</button>
      <span class="acts">${p.archived ? `<button class="chip" data-act="habit-restore" data-pid="${esc(p.id)}">${t("恢复")}</button>` : `<button class="chip share" data-act="habit-share" data-pid="${esc(p.id)}" aria-pressed="${p.share === "family"}" title="${t("完成情况开给家人看")}">${p.share === "family" ? `👪 ${t("家人可见")}` : t("仅自己")}</button>`}</span></div>`; };
  // “全部”里习惯和用药各一组，用小标题分开；只有一组时不加
  const secs = f === "all" && groups.habits.filter(match).length && groups.meds.filter(match).length ? [[t("习惯与提醒"), groups.habits.filter(match)], [t("用药与保健品"), groups.meds.filter(match)]] : null;
  const body = list.length ? (secs ? secs.map(([l, g]) => `<div class="glabel">${l} <span class="cnt">${g.length}</span></div>${g.map(row).join("")}`).join("") : list.map(row).join(""))
    : `<div class="empty">${q ? t("没有符合的条目。") : f === "archived" ? t("没有归档的习惯。") : f === "meds" ? t("还没有用药或保健品。") : t("还没有习惯。")}${!q && f !== "archived" && !all.length ? `<br><button class="ui-btn" data-tone="ghost" data-act="template-apply">${t("一键起步")}</button>` : ""}</div>`;
  const tabs = [["all", "全部"], ["habits", "习惯"], ["meds", "用药"], ["archived", "归档"]];
  const addAttr = f === "meds" ? 'data-act="habit-add-kind" data-kind="med"' : 'data-act="habit-add"';
  $("#sheetIn").innerHTML = `${head(t("习惯与用药"))}
  <div class="seg eq" role="group" aria-label="${t("分类")}">${tabs.map(([k, l]) => `<button data-hf="${k}" aria-pressed="${f === k}">${t(l)} <span class="cnt">${groups[k].length}</span></button>`).join("")}</div>
  ${fbar({ id: "hb", q: all.length > 5 ? { id: "habQ", value: S.habitsQ || "", ph: "搜索习惯、药名" } : null, add: { attrs: addAttr, label: f === "meds" ? "用药" : "新增" } })}
  <div class="panel" style="padding:4px 10px">${body}</div>
  <p class="small muted">${t("点一项编辑目标、日子、时间点和提醒。“家人可见”只分享做了没有；删除先归档，归档后再删才会连记录一起删。")}${!S.family ? " " + t("加入家庭后才能开给家人看。") : ""}</p>`;
  showSheet();
}

/* ---- 读经计划 ---- */
function openPlan(){
  const st = wb.planState(), cur = wb.currentPlan(), custom = st.custom;
  const opts = [...PLANS.map(p => [p.id, tc(p.name), tc(p.desc), p.items.length]), ...(custom && custom.items && custom.items.length ? [["custom", custom.name || t("自定义计划"), "", custom.items.length]] : [])];
  const prog = cur ? (st.progress[cur.id] || 0) % cur.items.length : 0;
  $("#sheetIn").innerHTML = `${head(t("读经计划"))}
  ${opts.map(([id, name, desc, n]) => `<div class="panel" style="margin-top:10px"><div class="row"><div class="v"><b>${esc(name)}</b><div class="small muted">${esc(desc)} ${t("共 {n} 段", { n })}${st.progress[id] ? ` · ${t("已读到第 {i} 段", { i: (st.progress[id] % n) + 1 })}` : ""}</div></div><button class="ui-btn" data-tone="${st.id === id ? "ghost" : "primary"}" data-plan="${esc(id)}" ${st.id === id ? "disabled" : ""}>${st.id === id ? t("当前") : t("选用")}</button></div></div>`).join("")}
  ${cur ? `<h2>${t("进度")}</h2><div class="panel"><p>${t("「{name}」第 {i} / {n} 段：{label}", { name: esc(cur.name), i: prog + 1, n: cur.items.length, label: esc(cur.items[prog].label) })}</p>
    <div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="ghost" data-act="plan-back">${t("退一段")}</button><button class="ui-btn" data-tone="ghost" data-act="plan-skip">${t("跳过这段")}</button><button class="ui-btn" data-tone="ghost" data-act="plan-jump">${t("跳到…")}</button><button class="ui-btn" data-tone="ghost" data-act="plan-restart">${t("从头开始")}</button></div>
    <p class="small muted" style="margin-top:8px">${t("按进度走，不按日期：漏了几天不会堆积，接着读就好。")}</p></div>` : ""}
  <h2>${t("自己的计划")}</h2><div class="panel"><p class="small">${t("教会的年度读经表、自己排的顺序都可以导入：每行一段，如“创世记 1-3，神创造天地”。")}</p><div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="ghost" data-act="plan-import">${t("导入")}</button></div></div>
  <h2>${t("译本")}</h2><div class="panel">${versionHTML()}</div>`;
  showSheet();
}
function versionHTML(){
  const s = wb.settings();
  const zh = s.versionZh || "和合本", en = s.versionEn || "BSB";
  return `<div class="seg" role="group" aria-label="${t("中文译本")}">${["和合本", "新译本", "当代译本"].map(v => `<button data-ver-zh="${v}" aria-pressed="${zh === v}">${v}</button>`).join("")}</div>
  <div class="seg" role="group" aria-label="English version" style="margin-top:8px">${["BSB", "WEB", "KJV", "ASV", "（不显示英文）"].map(v => `<button data-ver-en="${v === "（不显示英文）" ? "" : v}" aria-pressed="${(en || "（不显示英文）") === v}">${esc(t(v))}</button>`).join("")}</div>
  <p class="small muted" style="margin-top:8px">${t("经文从公开接口直接取（getBible、Free Use Bible API），不经过任何中间服务器。")}</p>`;
}

/* ---- 日历订阅 ---- */
function icsUrl(){ const tok = S.wb.profile && S.wb.profile.ics_token; return tok ? `${ICS_FUNCTION}?t=${tok}` : ""; }
function openCalendar(){
  const url = icsUrl(), webcal = url.replace(/^https:/, "webcal:");
  const n = wb.activePractices().filter(p => p.schedule && p.schedule.remind !== false && p.schedule.times && p.schedule.times.length).length;
  $("#sheetIn").innerHTML = `${head(t("日历订阅提醒"))}
  <p>${t("手机自带的日历负责响铃：订阅这个链接后，每个开了提醒的习惯都会按时间点出现在日历里，带一个提醒。改了习惯，日历会在几小时内自动更新。")}</p>
  <p>${t("有日期的任务和事件也会进来（带提醒；重复的按重复规则，完成后自动从日历里消失，最多晚几小时）。")}</p>
  <div class="panel"><p class="small muted" style="margin:0 0 6px">${t("你的订阅链接（相当于钥匙，别转发）")}</p>
    <p class="num" style="word-break:break-all;font-size:13px">${esc(url || t("登录后生成"))}</p>
    <div class="ui-acts btns" style="margin-top:0">${url ? `<a class="ui-btn" data-tone="primary" href="${esc(webcal)}" style="text-decoration:none;text-align:center">${t("在手机上订阅")}</a><button class="ui-btn" data-tone="ghost" data-copy="${esc(url)}">${t("复制链接")}</button><button class="ui-btn" data-tone="ghost" data-act="ics-reset">${t("换一把钥匙")}</button>` : ""}</div>
    <p class="small muted" style="margin-top:8px">${t("现在有 {n} 项开了提醒。", { n })}</p></div>
  <h2>${t("怎么订阅")}</h2>
  <div class="panel"><ul class="plain small" style="margin:0">
    <li>${t("iPhone：点“在手机上订阅”，或 设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历，粘贴链接。")}</li>
    <li>${t("Android / Google 日历：在电脑上打开 calendar.google.com → 其他日历 ＋ → 通过网址添加，粘贴链接；手机上就会同步。Google 大约每 12–24 小时刷新一次。")}</li>
    <li>${t("Outlook：添加日历 → 从 Internet 订阅。")}</li>
    <li>${t("提醒时间在每项习惯里改；关掉某项的“进日历订阅提醒”它就从日历里消失。")}</li>
  </ul></div>
  <h2>${t("为什么不用推送")}</h2>
  <div class="panel"><p class="small">${t("网页推送在 iPhone 上要先“添加到主屏幕”，还需要一台服务器定时发；日历订阅不需要任何这些，而且用药这种按时间点的提醒本来就最适合放日历。以后需要再加推送。")}</p>
  <p class="small muted">${t("链接是公开可读的（谁拿到都能看你的提醒标题和时间），所以不要分享；担心泄露就换一把钥匙，旧链接立刻失效。")}</p></div>`;
  showSheet();
}

/* ---- 设置 ---- */
function themePref(){ try { return localStorage.getItem(LS_PREFIX + ".theme") || ""; } catch (e) { return ""; } }
function openSettings(){
  $("#sheetIn").innerHTML = `${head(esc(t("设置")))}
  <h2>${t("账号与家庭")}</h2>
  ${familyHTML()}

  <h2>${t("任务提醒与催办")}</h2>
  <div class="panel">${nudgeSettingsHTML()}</div>

  <h2>${t("存储用量")}</h2>
  <p class="small muted" style="margin-top:0">${t("看看数据占了 Supabase 免费空间的多少，快满之前会变黄、变红提醒你。")}</p>
  ${usageHTML()}

  <h2>${t("姊妹应用")}</h2>
  <div class="panel" style="padding:4px 14px">
    ${SISTER_APPS.map(a => `<div class="medrow"><div><b>${a.id === THIS_APP ? esc(t(a.name)) : `<a href="${a.url}">${esc(t(a.name))}</a>`}</b>${a.id === THIS_APP ? ` <span class="small muted">${t("（当前）")}</span>` : ""}<div class="small muted">${tc(esc(a.desc))}</div></div>${a.id === THIS_APP ? "" : `<a class="chip" href="${a.url}" style="text-decoration:none">${t("打开")}</a>`}</div>`).join("")}
  </div>
  <p class="small muted">${t("同一个账号、同一个家庭，四个站点互通；标题旁的左右箭头也能切换。")}</p>

  <h2>${t("AI 助手")}</h2>
  <div class="panel"><p class="small" style="margin-top:0">${t("拍照识字、把笔记整理成请教清单 / 书信 / 讲解，需要你自己的 AI key（只存在这台设备的浏览器里）。")} ${aiReady() ? `<b>${t("已设置：")}${esc(t(providerOf(aiSettings().provider).name))}</b>` : t("还没设置。")}</p>
    <div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="ghost" data-act="ai-settings">${t("设置 AI")}</button></div></div>

  <h2>${t("界面语言")}</h2>
  <div class="seg" role="group" aria-label="${t("界面语言")}">${LOCALES.map(([v, l]) => `<button data-locale-set="${v}" aria-pressed="${locale() === v}" lang="${v}">${l}</button>`).join("")}</div>
  <p class="small muted">${t("切换整个界面的文字。你自己录入的内容（习惯名、祷告事项、备注……）保持输入时的样子。")}</p>

  <h2>${t("显示")}</h2>
  <div class="seg" role="group" aria-label="${t("外观")}">${[["", t("跟随系统")], ["light", t("浅色")], ["dark", t("深色")]].map(([v, l]) => `<button data-theme-set="${v}" aria-pressed="${themePref() === v}">${esc(l)}</button>`).join("")}</div>
  <div class="small muted" style="margin:12px 0 6px">${t("列表每次显示")}</div>
  <div class="seg" role="group" aria-label="${t("列表每次显示")}">${PAGE_SIZES.map(n => `<button data-page-size="${n}" aria-pressed="${pageSize() === n}">${esc(t("{n} 条", { n }))}</button>`).join("")}</div>
  <p class="small muted" style="margin-top:24px">${t("版本")} ${APP_VERSION}</p>`;
  showSheet();
}

export { showSheet, closeSheet, openForm, drawForm, readForm, getForm, openInfo, openSettings, openPractice, openHabits, openPlan, openCalendar, icsUrl, head };

/* ---- 设置里的“任务提醒与催办”：每一项都能关 ---- */
function nudgeSettingsHTML(){
  const n = tk.nudge();
  const b = (k, v, label, on) => `<button data-act="nudge-set" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const onoff = (k, label, hint) => `<div class="field"><div class="lab">${t(label)}</div><div class="seg" role="group" aria-label="${esc(t(label))}">${b(k, "1", t("开"), !!n[k])}${b(k, "0", t("关"), !n[k])}</div>${hint ? `<div class="small muted" style="margin-top:4px">${t(hint)}</div>` : ""}</div>`;
  return `${onoff("bar", "催办条", "今天页和任务页顶部：逾期几件、下一件几点。")}
    ${onoff("escalate", "逾期阶梯", "逾期越久颜色越深；同一件顺延 3 次后要你决定：现在做 / 拆小 / 定时间 / 放弃。")}
    ${onoff("evening", "晚间收尾", "晚上提醒把没做完的放到明天或放弃。")}
    <div class="field"><div class="lab">${t("收尾提醒时间")}</div><div class="seg">${["20:00", "21:00", "22:00"].map(v => b("eveningAt", v, v, n.eveningAt === v)).join("")}</div></div>
    <div class="field"><div class="lab">${t("今天的容量（小时）")}</div><div class="seg">${[4, 6, 8, 10].map(v => b("capacityH", String(v), String(v), n.capacityH === v)).join("")}</div><div class="small muted" style="margin-top:4px">${t("今天任务的预估时间加起来超过它，会提示排太满了。")}</div></div>
    <div class="field"><div class="lab">${t("一句话添加带时间的任务，默认提醒")}</div><div class="seg">${[[[0], "准时"], [[10], "提前 10 分钟"], [[30], "提前 30 分钟"], [[], "不提醒"]].map(([v, l]) => b("remind", JSON.stringify(v), t(l), JSON.stringify(n.remind) === JSON.stringify(v))).join("")}</div></div>
    <div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="ghost" data-act="tk-cats">${t("管理任务分类")}</button></div>
    <p class="small muted" style="margin-top:8px">${t("提醒靠手机日历响铃（订阅链接在“我的 → 日历订阅”）。读经、祷告这类灵修习惯不催。")}</p>`;
}
