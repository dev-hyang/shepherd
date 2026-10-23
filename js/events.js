import { sbAuth, sbFamily, sbLink, sbLogout } from "./core/auth.js";
import { LS_PREFIX } from "./core/config.js";
import { setLocale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc, hm, toast } from "./core/util.js";
import { EXERCISE_TYPES, PRAYER_CATS, RATINGS, kindOf } from "./data/kinds.js";
import { parsePlan } from "./data/plans.js";
import { openAbout } from "./about.js";
import * as fz from "./focus.js";
import { closeSheet, drawForm, getForm, head, openCalendar, openForm, openHabits, openInfo, openPlan, openPractice, openSettings, readForm, showSheet } from "./sheet.js";
import { render } from "./views.js";
import * as wb from "./wb.js";
import * as tkm from "./tk.js";
import { editCat, openCats, openMit, openTaskForm, resetCats, shiftPlan, startTidy } from "./tasks.js";

/* ============ 事件分发 ============
   表单的标题、字段名、占位都写简体（画的时候翻译）；toast 用 t()。写进数据库的值不翻译。 */
const close = () => closeSheet();
const back = fn => { close(); fn && fn(); };
const pidOf = d => wb.practice(d.pid);
// 补记选的那天：不能晚于今天，最早到历史数据范围（和回顾页一样 12 周）；选回今天就清掉
const setPick = day => {
  if (!day || day > S.day) return;
  if (day < wb.dayAdd(S.day, -wb.HISTORY_DAYS)) { toast(t("最多补记 {n} 天内的", { n: wb.HISTORY_DAYS })); return; }
  S.pick = day === S.day ? null : day; S.showText = false; render();
};
document.addEventListener("change", ev => { if (ev.target && ev.target.id === "pick-day" && ev.target.value) setPick(ev.target.value); });

// 任务：快速添加表单、清单的筛选 / 搜索（搜索框每次重画后把光标放回去）
document.addEventListener("submit", async ev => {
  if (!ev.target || ev.target.id !== "tkQuickForm") return;
  ev.preventDefault();
  const inp = $("#tkQuick"), v = inp && inp.value.trim(); if (!v) return;
  inp.disabled = true;
  try { const x = await tkm.quickAdd(v, wb.viewDay()); render(); if (x) toast(x.due ? t("已加到 {d}", { d: x.due }) : t("已放进收件箱")); } catch (e) { inp.disabled = false; }
  requestAnimationFrame(() => { const i = $("#tkQuick"); if (i) i.focus(); });
});
document.addEventListener("change", ev => { if (ev.target && ev.target.id === "tkPrio") { S.tkUi.prio = ev.target.value; render(); } });
document.addEventListener("input", ev => { if (ev.target && ev.target.id === "tkQ") { S.tkUi.q = ev.target.value; render(); const i = $("#tkQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } });

document.addEventListener("click", async ev => {
  const btn = ev.target.closest("button"); if (!btn) return;
  const d = btn.dataset;
  if (d.tab) { close(); S.tab = d.tab; S.pick = null; render(); window.scrollTo(0, 0); return; }
  if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast(t("已复制")); } catch (e) { toast(t("请手动复制：") + d.copy); } return; }
  if (d.themeSet !== undefined) { if (d.themeSet) document.documentElement.dataset.theme = d.themeSet; else delete document.documentElement.dataset.theme; try { localStorage.setItem(LS_PREFIX + ".theme", d.themeSet); } catch (e) {} openSettings(); return; }
  if (d.localeSet !== undefined) { setLocale(d.localeSet); render(); openSettings(); if (S.cloud === "ready" && S.wb.loaded) wb.saveSettings({ lang: d.localeSet }).catch(() => {}); return; }
  // generic form controls
  if (d.seg) { readForm(); const dr = getForm().draft; dr[d.seg] = d.v; if (d.seg === "cat") dr.sub = ""; drawForm(); return; }   // 换大类：小类清空重选
  if (d.tks) { S.tkUi.seg = d.tks; render(); return; }
  if (d.tkr) { S.tkUi.range = d.tkr; render(); return; }
  if (d.multi) { readForm(); const f = getForm().draft, cur = (f[d.multi] || []).map(String); f[d.multi] = cur.includes(d.v) ? cur.filter(x => x !== d.v) : [...cur, d.v]; drawForm(); return; }
  // chips with their own data attributes
  if (d.hf) { openHabits(d.hf); return; }
  if (d.plan) { await wb.choosePlan(d.plan); openPlan(); toast(t("已切换读经计划")); return; }
  if (d.verZh !== undefined) { await wb.saveSettings({ versionZh: d.verZh }); openPlan(); return; }
  if (d.verEn !== undefined) { await wb.saveSettings({ versionEn: d.verEn }); openPlan(); return; }
  if (d.pfStatus) { S.prayerFilter.status = d.pfStatus; render(); return; }
  if (d.pfCat) { S.prayerFilter.cat = d.pfCat; render(); return; }
  if (d.range) { S.review.range = d.range; render(); return; }
  if (d.metric) { S.review.metric = d.metric; render(); return; }

  try {
    switch (d.act) {
      case "settings": openSettings(); break;
      /* 任务 */
      case "tk-new": openTaskForm(null, { due: d.day || wb.viewDay(), start_time: d.time || "" }); break;
      case "tk-edit": case "tk-split": { const x = tkm.task(d.tid); if (x) openTaskForm(x); break; }
      case "tk-done": { const r = await tkm.complete(d.tid, wb.viewDay()); render(); toast(r ? t("做完了，下一次 {d}", { d: r.next }) : t("做完了 ✓")); break; }
      case "tk-later": { const to = await tkm.postpone(d.tid); render(); if (to) toast(t("顺延到 {d}", { d: to })); break; }
      case "tk-sub": await tkm.toggleSub(d.tid, +d.i); render(); break;
      case "tk-drop": if (!confirm(t("放弃这件事？放弃不算失败，重复任务只跳过这一次。"))) break; await tkm.drop(d.tid); render(); break;
      case "tk-now": fz.openFocus(null); toast(t("先专注 25 分钟，做完回来勾掉它")); break;
      case "tk-undo-log": await tkm.undoLog(d.lid); render(); break;
      case "tk-reopen": await tkm.reopen(d.tid); render(); break;
      case "tk-del": if (confirm(t("删除这条任务？"))) { await tkm.remove(d.tid); render(); } break;
      case "tk-open-overdue": S.tab = "tasks"; S.tkUi.seg = "today"; render(); window.scrollTo(0, 0); break;
      case "tk-mit": openMit(); break;
      case "tk-tidy": startTidy(); break;
      case "tk-evening": {
        const list = [...tkm.overdue(), ...tkm.onDay(S.day).filter(x => !x.virtual)];
        if (d.to === "drop") { if (!confirm(t("把这 {n} 件都放弃？放弃不算失败。", { n: list.length }))) break; for (const x of list) await tkm.drop(x.id); }
        else { const to = wb.dayAdd(S.day, 1); for (const x of list) await tkm.postpone(x.id, to); }
        render(); toast(d.to === "drop" ? t("放下了，明天重新开始") : t("都放到明天了，早点休息")); break; }
      case "tk-prev": shiftPlan(-1); render(); break;
      case "tk-next": shiftPlan(1); render(); break;
      case "tk-today": S.tkUi.day = null; render(); break;
      case "tk-goto": S.tkUi.day = d.day; S.tkUi.range = "day"; render(); window.scrollTo(0, 0); break;
      case "tk-goto-month": S.tkUi.day = d.day; render(); break;
      case "tk-cats": openCats(); break;
      case "cat-add": editCat(null); break;
      case "cat-edit": editCat(d.cid); break;
      case "cat-reset": await resetCats(); break;
      case "nudge-set": { const k = d.k, v = d.v; await tkm.saveNudge({ [k]: k === "eveningAt" ? v : k === "capacityH" ? +v : k === "remind" ? JSON.parse(v) : v === "1" }); openSettings(); break; }

      case "about": openAbout(); break;
      case "close": close(); break;
      case "sb-login": await sbAuth("login"); break;
      case "sb-signup": await sbAuth("signup"); break;
      case "sb-link": await sbLink(); break;
      case "sb-create": await sbFamily("create"); break;
      case "sb-join": await sbFamily("join"); break;
      case "sb-logout": await sbLogout(); break;

      /* 读经 */
      case "plan": openPlan(); break;
      case "read-done": { const tp = wb.todayPassage(); if (!tp) break; await wb.markRead(tp); S.showText = false; render(); toast(t("记下了，明天接着读")); break; }
      case "read-undo": await wb.unmarkRead(); render(); break;
      case "read-text": S.showText = !S.showText; render(); break;
      case "read-other": openForm("另记一段", [{ k: "ref", label: "读了哪里", type: "text", ph: "诗篇 23 / 罗马书 8" }, { k: "note", label: "一句感想（可空）", type: "text" }], { ref: "", note: "" }, async f => { if (!f.ref) { toast(t("请填出处")); return; } await wb.logReading(f.ref, f.note); back(); }); break;
      case "log-del": await wb.deleteLog(d.lid); if ($("#sheet").open) close(); else render(); break;
      case "plan-back": await wb.movePlan(-1); openPlan(); break;
      case "plan-skip": await wb.movePlan(1); openPlan(); break;
      case "plan-restart": if (confirm(t("这个计划从第 1 段重新开始？"))) { await wb.setPlanIndex(0); openPlan(); } break;
      case "plan-jump": { const cur = wb.currentPlan(); if (!cur) break; openForm("跳到第几段", [{ k: "i", label: t("1 到 {n}", { n: cur.items.length }), type: "num" }], { i: null }, async f => { if (!f.i) return; await wb.setPlanIndex(f.i - 1); openPlan(); }); break; }
      case "plan-import": openForm("导入读经计划", [{ k: "name", label: "计划名称", type: "text", ph: "教会 2027 年读经表" }, { k: "text", label: "每行一段：出处，备注（可选）", type: "area", rows: 10, ph: "创世记 1-3，神创造天地\n诗篇 1-5; 箴言 1" }], { name: "", text: "" },
        async f => { const items = parsePlan(f.text); if (!items.length) { toast(t("没有读到任何段落")); return; } await wb.importPlan(f.name, items); toast(t("已导入 {n} 段并切换到该计划", { n: items.length })); openPlan(); }); break;

      /* 补记：切到过去某一天，打卡 / 读经都记到那天；回到今天恢复 */
      case "day-prev": setPick(wb.dayAdd(wb.viewDay(), -1)); break;
      case "day-next": setPick(wb.dayAdd(wb.viewDay(), 1)); break;
      case "day-today": setPick(S.day); break;

      /* 习惯打卡 */
      case "check": { const p = pidOf(d); if (!p) break; const on = await wb.toggleCheck(p); render(); if (on) toast(t("做到了 ✓")); break; }
      case "count-add": { const p = pidOf(d); if (!p) break; await wb.addLog(p.kind, p.id, p.kind === "prayer" ? { count: S.wb.prayers.filter(x => x.status !== "answered").length } : {}); render(); break; }
      case "count-undo": { const p = pidOf(d); if (!p) break; const ls = wb.logsFor(p.id, wb.viewDay()); if (ls.length) await wb.deleteLog(ls[ls.length - 1].id); render(); break; }
      case "min-add": { const p = pidOf(d); if (!p) break; const tg = p.target || {};
        openForm("记一次", [{ k: "minutes", label: "多少分钟", type: "num", ph: String(tg.minutes || 30) }, ...(p.kind === "exercise" ? [{ k: "type", label: "类型", type: "seg", opts: EXERCISE_TYPES.map(x => [x, x]) }] : []), { k: "note", label: "备注（可空）", type: "text" }],
          { minutes: null, type: "走路", note: "" }, async f => { if (!f.minutes) { toast(t("请填分钟数")); return; } await wb.addLog(p.kind, p.id, { minutes: f.minutes, type: p.kind === "exercise" ? f.type : undefined, note: f.note }); back(); }); break; }
      case "min-list": { const p = pidOf(d); if (!p) break; const ls = wb.logsFor(p.id, wb.viewDay());
        openInfo("今天的记录", `<div class="panel" style="padding:4px 14px">${ls.map(l => `<div class="medrow"><span>${hm(l.ts)} · <b>${l.data.minutes} ${t("分钟")}</b>${l.data.type ? ` · ${t(l.data.type)}` : ""}${l.data.note ? ` · ${esc(l.data.note)}` : ""}</span><button class="chip" data-act="log-del" data-lid="${esc(l.id)}">${t("删")}</button></div>`).join("")}</div>`); break; }
      case "rate": { const p = pidOf(d); if (!p) break; const st = wb.statusOf(p);
        if (st.rating === +d.v) { openForm("今天的饮食", [{ k: "note", label: "备注（吃了什么、为什么失控……）", type: "area" }], { note: (st.log && st.log.data.note) || "" }, async f => { await wb.setDaily(p, { note: f.note }); back(); }); break; }
        await wb.setDaily(p, { rating: +d.v }); render(); break; }
      case "value-set": { const p = pidOf(d); if (!p) break; const st = wb.statusOf(p), screen = p.kind === "screen";
        openForm(screen ? "今天的屏幕时长" : "昨晚的睡眠", [{ k: "value", label: screen ? "分钟（iPhone：设置 → 屏幕使用时间；Android：数字健康）" : "小时", type: "num", step: screen ? 5 : 0.5 }, ...(screen ? [{ k: "quick", label: "或者大概", type: "seg", raw: true, opts: [30, 60, 90, 120, 180, 240].map(v => [String(v), `${v}`]) }] : [])],
          { value: st.value, quick: "" }, async f => { const v = f.value != null ? f.value : (f.quick ? +f.quick : null); if (v == null) { toast(t("请填一个数")); return; } await wb.setDaily(p, { value: v }); back(); }); break; }
      case "slot": { const p = pidOf(d); if (!p) break; await wb.setSlot(p, d.slot, d.v === "undo" ? null : d.v === "taken"); render(); break; }
      case "template-apply": { const n = await wb.applyTemplate(); if ($("#sheet").open) openHabits(); else render(); toast(n ? t("已建立 {n} 项习惯，点一项可以改", { n }) : t("这些习惯都已经有了")); break; }

      /* 习惯管理 */
      case "habits": openHabits("all"); break;
      case "meds": openHabits("meds"); break;
      case "habit-add": openPractice(null); break;
      case "habit-add-kind": openPractice({ kind: d.kind, schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"], remind: true } }); break;
      case "habit-edit": { const p = pidOf(d); if (p) openPractice(p); break; }
      case "habit-restore": { const p = pidOf(d); if (p) { await wb.upsertPractice({ ...p, archived: false, active: true }); openHabits(); } break; }
      case "habit-share": { const p = pidOf(d); if (!p) break; if (p.share !== "family" && !S.family) { toast(t("先在设置里加入家庭")); break; }
        await wb.upsertPractice({ ...p, share: p.share === "family" ? "private" : "family" }); openHabits(); toast(p.share === "family" ? t("已收回，只有自己看得到") : t("家人现在能看到这项做了没有")); break; }

      /* 专注计时 */
      case "focus": fz.openFocus(d.pid || null); break;
      case "fz-start": fz.start(); break;
      case "fz-pause": fz.pause(); break;
      case "fz-resume": fz.resume(); break;
      case "fz-stop": await fz.stop(); break;
      case "fz-skip": fz.skip(); break;
      case "fz-reset": fz.reset(); break;
      case "fz-cfg": await fz.setCfg({ [d.k]: d.v === "true" ? true : d.v === "false" ? false : +d.v }); fz.openFocus(); break;
      case "fz-notify": await fz.askNotify(); break;

      /* 日历订阅 */
      case "calendar": openCalendar(); break;
      case "ics-reset": if (confirm(t("换一把钥匙后，旧链接立刻失效，手机上要重新订阅。继续吗？"))) { await wb.resetIcsToken(); openCalendar(); toast(t("已换新链接")); } break;

      /* 祷告 */
      case "pray-today": { const p = wb.firstOfKind("prayer"); await wb.addLog("prayer", p ? p.id : null, { count: S.wb.prayers.filter(x => x.status !== "answered").length }); render(); break; }
      case "pray-today-undo": { const p = wb.firstOfKind("prayer"); const ls = p ? wb.logsFor(p.id, wb.viewDay()) : wb.logsOfKind("prayer", wb.viewDay()); if (ls.length) await wb.deleteLog(ls[ls.length - 1].id); render(); break; }
      case "prayer-add": openForm("代祷事项", prayerFields(), { text: "", category: "family" }, async f => { if (!f.text) { toast(t("请填内容")); return; } await wb.upsertPrayer(f); back(); }); break;
      case "prayer-edit": { const p = wb.prayerOf(d.id); if (!p) break; openForm("代祷事项", [...prayerFields(), ...(p.status === "answered" ? [{ k: "answer", label: "怎么应允的", type: "area" }] : [])], p, async f => { await wb.upsertPrayer({ ...p, ...f }); back(); }, async () => { if (confirm(t("删除这条代祷事项？"))) { await wb.deletePrayer(p.id); back(); } }); break; }
      case "prayer-prayed": await wb.prayed(d.id); render(); break;
      case "prayer-answered": { const p = wb.prayerOf(d.id); if (!p) break; openForm("感谢主", [{ k: "html", type: "html", html: `<p><b>${esc(p.text)}</b></p>` }, { k: "answer", label: "怎么应允的（可空）", type: "area", rows: 4 }], { answer: "" }, async f => { await wb.answerPrayer(p.id, f.answer); back(); toast(t("已记为应允")); }); break; }
      case "prayer-reopen": await wb.reopenPrayer(d.id); render(); break;

      /* 表单 */
      case "form-save": { readForm(); const f = getForm(); await f.onSave(f.draft); break; }
      case "form-delete": { const f = getForm(); if (f.onDelete) await f.onDelete(); break; }
    }
  } catch (e) { console.error(e); /* run() already toasted; keep the page usable */ }
});
const prayerFields = () => [
  { k: "text", label: "为谁、为什么祷告", type: "area", rows: 3, ph: "妈妈的膝盖手术顺利" },
  { k: "category", label: "分类", type: "seg", opts: Object.entries(PRAYER_CATS) }];

document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#sheet").open) closeSheet(); });
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && S.cloud === "ready" && S.wb.loaded && !$("#sheet").open) { await wb.loadAll(); try { await tkm.loadTasks(); } catch (e) { console.error(e); } render(); }
});
export { showSheet, head, kindOf, RATINGS };

// 顶栏语言切换器（共用组件）选了语言：和设置里一样，记在本机，登录后也记到账号设置
document.addEventListener("eco-set-lang", e => { setLocale(e.detail); render(); if (S.cloud === "ready" && S.wb.loaded) wb.saveSettings({ lang: e.detail }).catch(() => {}); });
