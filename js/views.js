import { updateMiniBar } from "./minibar.js";
import * as appSwitcherMod from "./shared/app-switcher.js";
import * as langSwitcherMod from "./shared/lang-switcher.js";
import { watchFormMenus } from "./shared/ui-form.js"; watchFormMenus();   // 表单页头 ⋯ 菜单：点外面 / Esc 关上
import { watchActs } from "./shared/ui-acts.js"; watchActs();   // 按钮条：取消靠前、主按钮靠后（shared/ui.css 的 ui-acts）
import { initInputSuggest } from "./shared/ui-suggest.js"; initInputSuggest();   // 可输入的下拉（input + datalist）：电脑上换成统一的建议面板，触屏用原生（shared/ui-suggest.js）
import { myName } from "./core/auth.js";
import { APP_VERSION, SISTER_APPS, THIS_APP } from "./core/config.js";
import { LOCALES, locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc, keepForms } from "./core/util.js";
import { WEEKDAY } from "./data/kinds.js";
import { releasesView } from "./releases-lazy.js";
import { viewMe } from "./me.js";
import { viewPrayer } from "./prayer.js";
import { viewHabits } from "./habits-page.js";
import { openSettings } from "./sheet.js";
import { viewToday } from "./today.js";
import { restoreHero } from "./med-hero.js";
import { viewRecords } from "./records.js";
import { viewHeroCfg } from "./herocfg.js";
import { viewHealth, openPendingNew } from "./health.js";
import { viewTasks } from "./tasks.js";
import { pendingCount } from "./tk.js";
import { crumbHTML, routeNav } from "./ui.js";

/* ============ 渲染 ============ */
const TAB_LABELS = { today: "今天", tasks: "任务", health: "健康", prayer: "祷告", me: "我的" };
const VIEWS = { today: viewToday, tasks: viewTasks, health: viewHealth, prayer: viewPrayer, me: viewMe };
/* 子页：挂在某个底部页签下面，顶部显示完整路径（像爱家小助手）：‹ 我的 / 咩咩咩。parent 也可以是另一个子页，路径一路显示到底部页签 */
const SUB = { releases: { parent: "me", label: "发布日志", view: releasesView, open: true }, habits: { parent: "today", label: "习惯", view: viewHabits }, records: { parent: "habits", label: "记录", view: viewRecords }, herocfg: { parent: "habits", label: "顶部卡片", view: viewHeroCfg } };   // 发布日志：js/releases-ui.js，数据在 js/data/releases.js
/** 子页一路往上找到它所在的底部页签（今天 / 习惯 / 顶部卡片 → 今天） */
const rootOf = tab => { let p = tab; while (SUB[p]) p = SUB[p].parent; return p; };
function crumbParts(tab){
  const parts = [{ label: SUB[tab].label }]; let p = SUB[tab].parent;
  while (p) { parts.unshift({ tab: p, label: SUB[p] ? SUB[p].label : TAB_LABELS[p] }); p = SUB[p] ? SUB[p].parent : null; }
  return parts;
}
/* 网址记住当前页（含页内的子页）：刷新、收藏后还停在这一页。和家庭学堂同一套做法。
   #/health/labs?who=…、#/health/visit/<id>、#/health/lab/<化验项>、#/tasks/list、#/prayer/notes、#/ask、#/releases
   只用 replaceState，不往浏览器历史里加条目（返回仍由「‹ 返回」/ 面包屑管）。登录回跳时 # 后面是 Supabase 的令牌，那时不动。 */
const ROUTE_TABS = new Set([...Object.keys(VIEWS), ...Object.keys(SUB)]);
function readRoute(hash = location.hash){
  const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash); if (!m) return null;
  let [tab, sub, id] = m[1].split("/").map(x => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
  if (tab === "review") tab = "habits"; if (tab === "ask") tab = "today";   // 回顾页已并进「今天 / 习惯」，旧链接转过去
  return ROUTE_TABS.has(tab) ? { tab, sub: sub || "", id: id || "", q: new URLSearchParams(m[2] || "") } : null;
}
function routeOf(){
  const enc = encodeURIComponent;
  if (S.tab === "health" && S.hlUi) {
    const u = S.hlUi, id = u.view === "visit" ? u.visitId : u.view === "lab" ? u.labKey : "";
    return `#/health${u.view && u.view !== "overview" ? "/" + u.view + (id ? "/" + enc(id) : "") : ""}${u.who ? "?who=" + enc(u.who) : ""}`;
  }
  if (S.tab === "tasks" && S.tkUi && S.tkUi.seg !== "home") return "#/tasks/" + S.tkUi.seg;
  if (S.tab === "prayer" && S.prayerView !== "home") return "#/prayer/" + S.prayerView;
  return S.tab === "today" ? "" : "#/" + S.tab;
}
/* 刷新后浏览器还留着「表单开着」的历史标记，但页面已经重新开始、什么都没开：清掉，不然 syncRoute 会一直以为表单还开着，再也不更新网址（刷新永远回到同一页） */
function clearStaleMarker(){ const hs = history.state; if (hs && hs.sheet) try { history.replaceState(null, "", location.href); } catch (e) {} }
let routeHash = null;   // 上一次写进 / 读出网址的 #；网址里的 # 和它不一样 = 外面改的（手动输入、收藏、浏览器后退），以网址为准
function restoreRoute(){
  routeHash = location.hash; clearStaleMarker(); const r = readRoute(); if (!r) return false;
  S.tab = r.tab;
  if (r.tab === "health") {
    const u = (S.hlUi ||= { who: null, view: "overview", metric: null });   // 子页名不认识时 health.js 自己退回概览
    u.view = r.sub || "overview"; u.back = null;
    if (r.sub === "visit") u.visitId = r.id; if (r.sub === "lab") u.labKey = r.id;
    if (r.q.get("who")) u.who = r.q.get("who");
    if (["lab", "visit", "measure"].includes(r.q.get("new"))) u.openNew = r.q.get("new");   // 其他应用直接打开「录入化验 / 就诊 / 测量」：#/health/labs?who=c:<孩子id>&new=lab（家庭学堂的化验页用）
  }
  if (r.tab === "tasks" && S.tkUi) S.tkUi.seg = ["today", "plan", "list"].includes(r.sub) ? r.sub : "home";
  if (r.tab === "tasks" && S.tkUi && r.sub === "done") { S.tkUi.seg = "list"; S.tkUi.st = "done"; }   // 旧链接：已完成 = 清单里筛「已完成」
  if (r.tab === "prayer") S.prayerView = ["read", "notes", "pray"].includes(r.sub) ? r.sub : "home";
  return true;
}
function syncRoute(){
  // 表单开着时，最上面那条历史是它自己压的，关掉时会 history.back()：这时不写，等退回去以后那次重画再写
  const hs = history.state;
  if ((hs && hs.sheet) || (location.hash.includes("=") && !location.hash.startsWith("#/"))) return;
  const h = routeOf();
  if (location.hash !== h) try { history.replaceState(history.state, "", location.pathname + location.search + h); } catch (e) {}
  routeHash = location.hash;
}
// 改了网址里的 #：跳到那一页（有的浏览器先派发 popstate，表单的关闭逻辑会抢先重画一次，所以 render 开头也查一遍）
function adoptRoute(){ if (routeHash === null || location.hash === routeHash || !readRoute()) return false; restoreRoute(); return true; }
window.addEventListener("hashchange", () => { if (adoptRoute()) { render(); window.scrollTo(0, 0); } });
/* 「‹ 返回」= 回到你刚才来的那一页；直接打开或刷新后没有上一页时，退到上一层。面包屑负责按层级往上跳，两者分工（和 iOS / 安卓 / 网页的常见做法一致） */
const NAV = { last: null, stack: [], back: false };
function trackNav(tab){ if (NAV.last && NAV.last !== tab && !NAV.back) { NAV.stack.push(NAV.last); if (NAV.stack.length > 30) NAV.stack.shift(); } NAV.back = false; NAV.last = tab; }
function backTo(parent){ NAV.back = true; while (NAV.stack.length) { const p = NAV.stack.pop(); if (p !== S.tab) return p; } return parent; }
/** 面包屑：第一项带「‹ 」，中间项可点，最后一项加粗当标题 */
function crumbNav(parts, cls = ""){
  const mini = cls.includes("mb"), cur = S.tab;
  // 目录 = 这一支的根页面 + 同一支下的所有子页（今天 / 习惯 / 记录 / 顶部卡片；我的 / 发布日志）
  const root = rootOf(cur), dir = mini ? null : [{ label: t(TAB_LABELS[root]), attrs: `data-tab="${root}"`, on: cur === root }, ...Object.keys(SUB).filter(k => rootOf(k) === root).map(k => ({ label: t(SUB[k].label), attrs: `data-tab="${k}"`, on: cur === k }))];
  return crumbHTML(parts.map(x => ({ label: t(x.label), attrs: x.tab ? `data-tab="${x.tab}"` : "" })), { back: `data-act="nav-back" data-parent="${parts[parts.length - 2].tab}"`, dir, cls: `route ${cls}`.trim() });
}
// 应用切换（姊妹站点共用）：右上角九宫格按钮，宽屏浮层、手机底部抽屉。组件是本应用自己的副本 js/shared/（母版在 home-pantry/shared/）。
// 语言切换：地球按钮 + 列表，以后加语言只要在 LOCALES 里加一项。
function renderLangSwitch(){
  const host = $("#langsw"); if (!host) return;
  const cur = locale();
  langSwitcherMod.mountLangSwitcher({ host, current: cur, ui: cur === "en" ? "en" : cur === "zh-TW" ? "tw" : "zh", languages: LOCALES.map(([code]) => ({ code })),
    onSelect: code => document.dispatchEvent(new CustomEvent("eco-set-lang", { detail: code })) });
}
function renderAppSwitch(){
  const host = $("#apps");
  appSwitcherMod.mountAppSwitcher({ host, current: THIS_APP, lang: locale() });
}
function renderStatus(){
  const st = { loading: ["", t("连接中")], offline: ["", t("云端不可用")], signedout: ["", t("未登录")], anon: ["", t("请绑定邮箱")],
    ready: ["ok", S.family ? t("家庭 · {n} 人", { n: Object.keys(S.members).length || 1 }) : t("个人")] }[S.cloud];
  $("#status").innerHTML = `<span class="dot ${st[0]}"></span>${esc(st[1])}`;
  $("#bname").textContent = t("牧羊人");
  const d = new Date();
  $("#bsub").textContent = S.cloud === "ready" ? `${esc(myName())} · ${S.day.slice(5).replace("-", "/")} ${t("周{d}", { d: t(WEEKDAY[d.getDay()]) })}` : t("身心灵 · 家人健康");
  { const v = $("#appver"); if (v) { v.setAttribute("aria-label", `${t("发布日志")} · ${t("版本")} ${APP_VERSION}`); v.title = t("发布日志"); } }   // 顶栏版本号点一下打开发布日志
  renderAppSwitch();
  renderLangSwitch();
  document.querySelectorAll("nav.tabs button").forEach(b => { const k = TAB_LABELS[b.dataset.tab]; if (!k) return; const txt = [...b.childNodes].find(x => x.nodeType === 3); if (txt) txt.nodeValue = t(k); else b.append(t(k)); });
  { const b = $("#tkBadge"); if (b) { const n = S.tk && S.tk.loaded ? pendingCount() : 0; b.textContent = n > 9 ? "9+" : String(n || ""); b.hidden = !n; } }   // 任务页签角标：逾期 + 今天到期
}
/** opts.bg = 后台触发的重画（实时同步、切回前台重读、过午夜、计时到点、AI 回来……）：
    正在填的表单（没保存的输入、焦点和光标）原样保住，见 util.keepForms。用户自己点的操作照旧直接重画 */
function render(opts){
  if (adoptRoute()) window.scrollTo(0, 0);
  renderStatus();
  trackNav(S.tab);
  const sub = SUB[S.tab], cur = rootOf(S.tab);   // 子页时底部仍高亮它所属的页签
  document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === cur) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = sub ? sub.view : VIEWS[S.tab] || viewToday;
  $("#main").className = S.tab === "today" || S.tab === "health" ? "wide" : "narrow";   // 今天、健康在宽屏用两栏
  const crumb = sub ? crumbNav(crumbParts(S.tab)) : "";
  S.route = null;   // 页面自己画路径（ui.routeNav）时记在这里，迷你栏用
  const html = crumb + (S.tab === "me" || (sub && sub.open) ? v() : (gateHTML() || v()));   // 我的、咩咩咩、发布日志 没登录也能看
  if (opts && opts.bg) keepForms($("#main"), () => { $("#main").innerHTML = html; });
  else $("#main").innerHTML = html;
  restoreHero();   // 今天页顶上的滑动卡：滑回刚才停的那一张
  openPendingNew();   // 网址里带 new=… 且健康数据已读完：打开对应的录入表（只一次）
  syncRoute();   // 页面画完再写网址（健康页会在画的时候纠正不存在的子页 / 人）
  updateMiniBar($("#bname").textContent, sub ? crumbNav(crumbParts(S.tab), "mb") : S.route ? routeNav(S.route).replace('class="crumb route"', 'class="crumb route mb"') : "", t("回到顶部"));
}
/** 后台重画 = render({ bg: true }) */
const renderBg = () => render({ bg: true });
// 设置页开着时跟着账号 / 家庭变化重画；登录、邀请码这些输入框里没提交的字保住
function refreshSettingsIfOpen(){ if ($("#sheet").open && $("#sheetTitle") && $("#sheetTitle").textContent === t("设置")) keepForms($("#sheetIn"), openSettings); }

/* 没登录 / 匿名 / 表没建时，每个页面都先把路指清楚 */
function gateHTML(){
  if (S.cloud === "loading") return `<div class="empty">${t("正在连接云端…")}</div>`;
  if (S.cloud === "offline") return `<div class="empty">${t("云端暂时不可用。")}<br>${t("请检查网络后刷新页面。")}</div>`;
  if (S.cloud === "signedout") return `<div class="empty">${t("用和小月亮一样的账号登录。这里记的是你自己的读经、祷告和身体，默认只有你自己看得到。")}<br><button class="ui-btn" data-tone="primary" data-act="settings">${t("去登录")}</button> <button class="ui-btn" data-tone="ghost" data-act="about">${t("了解牧羊人")}</button></div>`;
  if (S.cloud === "anon") return `<div class="empty">${t("你是用邀请码进来的匿名身份。个人记录需要一个正式账号，先绑定邮箱。")}<br><button class="ui-btn" data-tone="primary" data-act="settings">${t("绑定邮箱")}</button></div>`;
  if (S.wb.error === "missing") return `<div class="empty">${t("数据库还没有牧羊人的表。")}<br>${t("请在 Supabase 执行本地")} <code>supabase/migrations/013_shepherd.sql</code>${t("，然后刷新。")}</div>`;
  if (S.wb.error) return `<div class="empty">${t("读取数据失败。")}<br>${t("请刷新重试。")}</div>`;
  if (!S.wb.loaded) return `<div class="empty">${t("正在读取…")}</div>`;
  return "";
}

export { backTo, renderStatus, render, renderBg, refreshSettingsIfOpen, gateHTML, crumbNav, SUB, restoreRoute };
