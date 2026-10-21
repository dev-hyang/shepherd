import { familyHTML } from "./core/auth.js";
import { APP_VERSION, ICS_FUNCTION, LS_PREFIX, SISTER_APPS, THIS_APP } from "./core/config.js";
import { LOCALES, locale, t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc } from "./core/util.js";
import { ALL_DAYS, KINDS, WEEKDAY, kindOf, modeOf } from "./data/kinds.js";
import { PLANS } from "./data/plans.js";
import { render } from "./views.js";
import * as wb from "./wb.js";

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
const head = (title, extra = "") => `<div class="sheet-head"><h3 id="sheetTitle">${title}</h3><span>${extra}<button class="iconbtn" data-act="close" aria-label="${esc(t("关闭"))}">${esc(t("关闭"))}</button></span></div>`;

/* ---- 通用小表单：spec 描述字段，保存时把 draft 交给 onSave ---- */
let form = null;
function openForm(title, fields, values, onSave, onDelete){
  form = { title, fields, draft: { ...values }, onSave, onDelete };
  drawForm(); showSheet();
}
function drawForm(){
  const { title, fields, draft, onDelete } = form;
  const html = fields.map(f => {
    if (f.when && !f.when(draft)) return "";
    const v = draft[f.k], id = "f_" + f.k, label = t(f.label || ""), ph = esc(t(f.ph || ""));
    const hint = f.hint ? `<div class="small muted" style="margin-top:4px">${t(f.hint)}</div>` : "";
    if (f.type === "seg") return `<div class="field"><div class="lab" id="${id}">${label}</div><div class="seg" role="group" aria-labelledby="${id}">${f.opts.map(([val, lab]) => `<button type="button" data-seg="${f.k}" data-v="${esc(val)}" aria-pressed="${String(v) === String(val)}">${esc(f.raw ? lab : t(lab))}</button>`).join("")}</div>${hint}</div>`;
    if (f.type === "multi") return `<div class="field"><div class="lab" id="${id}">${label}</div><div class="seg" role="group" aria-labelledby="${id}">${f.opts.map(([val, lab]) => `<button type="button" data-multi="${f.k}" data-v="${esc(val)}" aria-pressed="${(v || []).map(String).includes(String(val))}">${esc(f.raw ? lab : t(lab))}</button>`).join("")}</div>${hint}</div>`;
    if (f.type === "area") return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" data-f="${f.k}" placeholder="${ph}" ${f.rows ? `style="min-height:${f.rows * 24}px"` : ""}>${esc(v || "")}</textarea>${hint}</div>`;
    if (f.type === "num") return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" min="0" step="${f.step || 1}" data-f="${f.k}" value="${v ?? ""}" placeholder="${ph}">${hint}</div>`;
    if (f.type === "time") return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="time" data-f="${f.k}" value="${esc(v || "")}">${hint}</div>`;
    if (f.type === "date") return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="date" data-f="${f.k}" value="${esc(v || "")}">${hint}</div>`;
    if (f.type === "check") return `<div class="field"><label class="check"><input type="checkbox" data-f="${f.k}" ${v ? "checked" : ""}>${label}</label>${hint}</div>`;
    if (f.type === "html") return `<div class="field">${typeof f.html === "function" ? f.html(draft) : f.html}</div>`;
    const list = f.list ? `<datalist id="${id}_list">${f.list.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : "";
    return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="text" data-f="${f.k}" value="${esc(v || "")}" placeholder="${ph}" ${f.list ? `list="${id}_list"` : ""}>${list}${hint}</div>`;
  }).join("");
  $("#sheetIn").innerHTML = `${head(esc(t(title)))}${html}
    <div class="btns"><button class="btn primary" data-act="form-save">${t("保存")}</button>${onDelete ? `<button class="btn danger" data-act="form-delete">${t("删除")}</button>` : ""}</div>`;
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
function practiceFields(){
  const is = (...ks) => d => ks.includes(d.kind);
  return [
    { k: "kind", label: "种类", type: "seg", opts: kindOpts(), when: d => !d.id },
    { k: "name", label: "名称", type: "text", ph: "读经 / 晨跑 / 维生素 D" },
    { k: "per", label: "目标按", type: "seg", opts: [["day", "每天"], ["week", "每周"]], when: is("exercise", "custom") },
    { k: "count", label: "每周几次", type: "num", ph: "3", when: d => d.per === "week" && ["exercise", "custom"].includes(d.kind) },
    { k: "count", label: "每天几次", type: "num", ph: "1", when: is("prayer") },
    { k: "minutes", label: "每次多少分钟（可空）", type: "num", ph: "30", when: is("exercise", "custom") },
    { k: "max", label: "每天最多多少分钟", type: "num", ph: "120", when: is("screen") },
    { k: "min", label: "希望每晚睡几小时", type: "num", ph: "7", step: 0.5, when: is("sleep") },
    { k: "dose", label: "剂量", type: "text", ph: "1 片 / 2 粒", when: is("med", "supplement") },
    { k: "stock", label: "现在还剩多少（可空；每次“服了”自动减一）", type: "num", ph: "30", when: is("med", "supplement") },
    { k: "refillAt", label: "剩几天的量时提醒补货", type: "num", ph: "7", when: is("med", "supplement") },
    { k: "days", label: "哪几天", type: "multi", raw: true, opts: weekdayOpts(), hint: "按周算目标的习惯，哪天做都算；这里的日子只决定提醒。" },
    { k: "times", label: "时间点（提醒用，多个用逗号隔开；用药按时间点分别打卡）", type: "text", ph: "07:00, 21:30" },
    { k: "remind", label: "进日历订阅提醒", type: "check" },
    { k: "share", label: "完成情况开给家人看", type: "seg", opts: [["private", "仅自己"], ["family", "家人可见"]], hint: "家人只看到这项做了没有、分钟数和备注。祷告清单的内容永远只有你自己看得到。" },
    { k: "active", label: "进行中", type: "check" }
  ];
}
function practiceToDraft(p){
  const tg = p.target || {}, sc = p.schedule || {}, m = p.meta || {};
  return { id: p.id || null, kind: p.kind || "custom", name: p.name || "", per: tg.per || (p.kind === "exercise" ? "week" : "day"), count: tg.count ?? null, minutes: tg.minutes ?? null, max: tg.max ?? null, min: tg.min ?? null,
    dose: m.dose || "", stock: m.stock ?? null, refillAt: m.refillAt ?? null, days: sc.days || ALL_DAYS, times: (sc.times || []).join(", "), remind: sc.remind !== false, share: p.share || "private", active: p.active !== false, archived: !!p.archived };
}
function draftToPractice(d){
  const times = String(d.times || "").split(/[,，;；\s]+/).map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^(\d{1,2}):?(\d{2})$/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; }).filter(Boolean).sort();
  const per = ["exercise", "custom"].includes(d.kind) ? (d.per || "day") : "day";
  return { id: d.id || undefined, kind: d.kind, name: d.name, target: { per, count: d.count || null, minutes: d.minutes || null, max: d.max || null, min: d.min || null },
    schedule: { days: (d.days || []).map(Number), times, remind: !!d.remind }, meta: { dose: d.dose || "", stock: d.stock, refillAt: d.refillAt }, share: d.share, active: d.active !== false, archived: !!d.archived };
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
/* 习惯列表：进行中 / 已归档；每行可编辑，可直接切换“家人可见” */
function openHabits(filter){
  S.habitsFilter = filter || S.habitsFilter || "all";
  const all = S.wb.practices, f = S.habitsFilter;
  const list = all.filter(p => f === "meds" ? ["med", "supplement"].includes(p.kind) : f === "archived" ? p.archived : !p.archived);
  const row = p => { const k = kindOf(p), tg = p.target || {}, sc = p.schedule || {}, m = p.meta || {};
    const goal = modeOf(p) === "minutes" ? (tg.per === "week" ? t("每周 {n} 次 · 每次 {m} 分钟", { n: tg.count || 1, m: tg.minutes || "–" }) : t("每天 {m} 分钟", { m: tg.minutes || "–" }))
      : p.kind === "screen" ? t("每天不超过 {m} 分钟", { m: tg.max || "–" }) : p.kind === "sleep" ? t("每晚 {h} 小时", { h: tg.min || "–" }) : p.kind === "prayer" ? t("每天 {n} 次", { n: tg.count || 1 })
      : ["med", "supplement"].includes(p.kind) ? `${esc(m.dose || "")}${m.stock != null && m.stock !== "" ? ` · ${t("剩 {n}", { n: m.stock })}` : ""}` : "";
    const days = (sc.days || ALL_DAYS).length === 7 ? t("每天") : (sc.days || []).map(d => t(WEEKDAY[d])).join("");
    const meta = [goal, days, sc.times && sc.times.length ? sc.times.join(" ") + (sc.remind === false ? "" : " ⏰") : ""].filter(Boolean).join(" · ");
    return `<div class="habit"><span class="hi" style="background:${k.color}22;color:${k.color}">${k.icon}</span>
      <button class="main" data-act="habit-edit" data-pid="${esc(p.id)}"><span class="title">${esc(p.name || t(k.label))}${p.active === false && !p.archived ? ` <span class="small muted">${t("（暂停）")}</span>` : ""}</span><span class="meta">${meta}</span></button>
      <span class="acts">${p.archived ? `<button class="chip" data-act="habit-restore" data-pid="${esc(p.id)}">${t("恢复")}</button>` : `<button class="chip" data-act="habit-share" data-pid="${esc(p.id)}" aria-pressed="${p.share === "family"}" title="${t("完成情况开给家人看")}">${p.share === "family" ? t("家人可见") : t("仅自己")}</button>`}</span></div>`; };
  $("#sheetIn").innerHTML = `${head(t("习惯与提醒"))}
  <div class="chips" role="group" aria-label="${t("筛选")}">${[["all", "进行中"], ["meds", "用药与保健品"], ["archived", "已归档"]].map(([k, l]) => `<button class="chip" data-hf="${k}" aria-pressed="${f === k}">${t(l)}</button>`).join("")}</div>
  <div class="panel" style="padding:4px 10px">${list.length ? list.map(row).join("") : `<div class="empty">${f === "archived" ? t("没有归档的习惯。") : t("还没有习惯。")}</div>`}</div>
  <div class="btns"><button class="btn primary" data-act="habit-add">＋ ${t("新习惯")}</button>${f === "meds" ? `<button class="btn" data-act="habit-add-kind" data-kind="med">＋ ${t("用药")}</button><button class="btn" data-act="habit-add-kind" data-kind="supplement">＋ ${t("保健品")}</button>` : ""}${all.length ? "" : `<button class="btn" data-act="template-apply">${t("一键起步")}</button>`}</div>
  <p class="small muted">${t("点一项编辑目标、日子、时间点和提醒。“家人可见”只分享做了没有；删除先归档，归档后再删才会连记录一起删。")}${!S.family ? " " + t("加入家庭后才能开给家人看。") : ""}</p>`;
  showSheet();
}

/* ---- 读经计划 ---- */
function openPlan(){
  const st = wb.planState(), cur = wb.currentPlan(), custom = st.custom;
  const opts = [...PLANS.map(p => [p.id, tc(p.name), tc(p.desc), p.items.length]), ...(custom && custom.items && custom.items.length ? [["custom", custom.name || t("自定义计划"), "", custom.items.length]] : [])];
  const prog = cur ? (st.progress[cur.id] || 0) % cur.items.length : 0;
  $("#sheetIn").innerHTML = `${head(t("读经计划"))}
  ${opts.map(([id, name, desc, n]) => `<div class="panel" style="margin-top:10px"><div class="row"><div class="v"><b>${esc(name)}</b><div class="small muted">${esc(desc)} ${t("共 {n} 段", { n })}${st.progress[id] ? ` · ${t("已读到第 {i} 段", { i: (st.progress[id] % n) + 1 })}` : ""}</div></div><button class="btn ${st.id === id ? "" : "primary"}" data-plan="${esc(id)}" ${st.id === id ? "disabled" : ""}>${st.id === id ? t("当前") : t("选用")}</button></div></div>`).join("")}
  ${cur ? `<h2>${t("进度")}</h2><div class="panel"><p>${t("「{name}」第 {i} / {n} 段：{label}", { name: esc(cur.name), i: prog + 1, n: cur.items.length, label: esc(cur.items[prog].label) })}</p>
    <div class="btns" style="margin-top:0"><button class="btn" data-act="plan-back">${t("退一段")}</button><button class="btn" data-act="plan-skip">${t("跳过这段")}</button><button class="btn" data-act="plan-jump">${t("跳到…")}</button><button class="btn" data-act="plan-restart">${t("从头开始")}</button></div>
    <p class="small muted" style="margin-top:8px">${t("按进度走，不按日期：漏了几天不会堆积，接着读就好。")}</p></div>` : ""}
  <h2>${t("自己的计划")}</h2><div class="panel"><p class="small">${t("教会的年度读经表、自己排的顺序都可以导入：每行一段，如“创世记 1-3，神创造天地”。")}</p><div class="btns" style="margin-top:0"><button class="btn" data-act="plan-import">${t("导入")}</button></div></div>
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
  <div class="panel"><p class="small muted" style="margin:0 0 6px">${t("你的订阅链接（相当于钥匙，别转发）")}</p>
    <p class="num" style="word-break:break-all;font-size:13px">${esc(url || t("登录后生成"))}</p>
    <div class="btns" style="margin-top:0">${url ? `<a class="btn primary" href="${esc(webcal)}" style="text-decoration:none;text-align:center">${t("在手机上订阅")}</a><button class="btn" data-copy="${esc(url)}">${t("复制链接")}</button><button class="btn" data-act="ics-reset">${t("换一把钥匙")}</button>` : ""}</div>
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

  <h2>${t("姊妹应用")}</h2>
  <div class="panel" style="padding:4px 14px">
    ${SISTER_APPS.map(a => `<div class="medrow"><div><b>${a.id === THIS_APP ? esc(t(a.name)) : `<a href="${a.url}">${esc(t(a.name))}</a>`}</b>${a.id === THIS_APP ? ` <span class="small muted">${t("（当前）")}</span>` : ""}<div class="small muted">${tc(esc(a.desc))}</div></div>${a.id === THIS_APP ? "" : `<a class="chip" href="${a.url}" style="text-decoration:none">${t("打开")}</a>`}</div>`).join("")}
  </div>
  <p class="small muted">${t("同一个账号、同一个家庭，四个站点互通；标题旁的左右箭头也能切换。")}</p>

  <h2>${t("界面语言")}</h2>
  <div class="seg" role="group" aria-label="${t("界面语言")}">${LOCALES.map(([v, l]) => `<button data-locale-set="${v}" aria-pressed="${locale() === v}" lang="${v}">${l}</button>`).join("")}</div>
  <p class="small muted">${t("切换整个界面的文字。你自己录入的内容（习惯名、祷告事项、备注……）保持输入时的样子。")}</p>

  <h2>${t("显示")}</h2>
  <div class="seg" role="group" aria-label="${t("外观")}">${[["", t("跟随系统")], ["light", t("浅色")], ["dark", t("深色")]].map(([v, l]) => `<button data-theme-set="${v}" aria-pressed="${themePref() === v}">${esc(l)}</button>`).join("")}</div>
  <p class="small muted" style="margin-top:24px">${t("版本")} ${APP_VERSION}</p>`;
  showSheet();
}

export { showSheet, closeSheet, openForm, drawForm, readForm, getForm, openInfo, openSettings, openPractice, openHabits, openPlan, openCalendar, icsUrl, head };
