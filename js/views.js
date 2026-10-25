import { updateMiniBar } from "./minibar.js";
import { myName } from "./core/auth.js";
import { SISTER_APPS, THIS_APP } from "./core/config.js";
import { LOCALES, locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc } from "./core/util.js";
import { WEEKDAY } from "./data/kinds.js";
import { viewAsk } from "./ask.js";
import { viewMe } from "./me.js";
import { viewPrayer } from "./prayer.js";
import { viewReview } from "./review.js";
import { openSettings } from "./sheet.js";
import { viewToday } from "./today.js";
import { viewTasks } from "./tasks.js";
import { pendingCount } from "./tk.js";

/* ============ 渲染 ============ */
const TAB_LABELS = { today: "今天", tasks: "任务", prayer: "祷告", review: "回顾", me: "我的" };
const VIEWS = { today: viewToday, tasks: viewTasks, prayer: viewPrayer, review: viewReview, me: viewMe };
/* 子页：挂在某个底部页签下面，顶部显示完整路径（像爱家小助手）：‹ 我的 / 咩咩咩。parent 也可以是另一个子页，路径一路显示到底部页签 */
const SUB = { ask: { parent: "me", label: "咩咩咩", view: viewAsk } };
function crumbParts(tab){
  const parts = [{ label: SUB[tab].label }]; let p = SUB[tab].parent;
  while (p) { parts.unshift({ tab: p, label: SUB[p] ? SUB[p].label : TAB_LABELS[p] }); p = SUB[p] ? SUB[p].parent : null; }
  return parts;
}
/** 面包屑：第一项带「‹ 」，中间项可点，最后一项加粗当标题 */
function crumbNav(parts, cls = ""){
  return `<nav class="crumb ${cls}" aria-label="${t("位置")}">${parts.map((x, i) => `${i ? '<span class="sep">/</span>' : ""}${i === parts.length - 1
    ? `<b aria-current="page">${t(x.label)}</b>` : `<button type="button" class="crumb-link" data-tab="${x.tab}">${i === 0 ? "‹ " : ""}${t(x.label)}</button>`}`).join("")}</nav>`;
}
// 应用切换（四个姊妹站点共用）：右上角九宫格按钮，宽屏浮层、手机底部抽屉。
// 组件放在 home-pantry/shared；首次离线加载不到时，先用原来的 ‹ 上一个 / 下一个 › 胶囊，切换不受影响。
const SWITCHER_URL = "https://dev-hyang.github.io/home-pantry/shared/app-switcher.js";
let switcherMod = null, switcherTried = false;
// 语言切换（四个姊妹站点共用）：地球按钮 + 列表，以后加语言只要在 LOCALES 里加一项
const LANG_URL = "https://dev-hyang.github.io/home-pantry/shared/lang-switcher.js";
let langMod = null, langTried = false;
function renderLangSwitch(){
  const host = $("#langsw"); if (!host) return;
  if (langMod) {
    const cur = locale();
    langMod.mountLangSwitcher({ host, current: cur, ui: cur === "en" ? "en" : cur === "zh-TW" ? "tw" : "zh", languages: LOCALES.map(([code]) => ({ code })),
      onSelect: code => document.dispatchEvent(new CustomEvent("eco-set-lang", { detail: code })) });
    return;
  }
  if (!langTried) { langTried = true; import(LANG_URL).then(m => { langMod = m; renderLangSwitch(); }).catch(() => {}); }
}
function renderAppSwitch(){
  const host = $("#apps");
  if (switcherMod) { switcherMod.mountAppSwitcher({ host, current: THIS_APP, lang: locale() }); return; }
  const i = SISTER_APPS.findIndex(a => a.id === THIS_APP), n = SISTER_APPS.length, prev = SISTER_APPS[(i - 1 + n) % n], next = SISTER_APPS[(i + 1) % n];
  const badge = (a, label) => `<a class="badge" href="${a.url}" title="${esc(t("切到{name}", { name: t(a.name) }))}" aria-label="${esc(t("切到{name}", { name: t(a.name) }))}">${label}</a>`;
  host.setAttribute("aria-label", t("切换姊妹应用"));
  host.innerHTML = badge(prev, `‹ ${esc(t(prev.short))}`) + badge(next, `${esc(t(next.short))} ›`);
  if (!switcherTried) { switcherTried = true; import(SWITCHER_URL).then(m => { switcherMod = m; renderAppSwitch(); }).catch(() => {}); }
}
function renderStatus(){
  const st = { loading: ["", t("连接中")], offline: ["", t("云端不可用")], signedout: ["", t("未登录")], anon: ["", t("请绑定邮箱")],
    ready: ["ok", S.family ? t("家庭 · {n} 人", { n: Object.keys(S.members).length || 1 }) : t("个人")] }[S.cloud];
  $("#status").innerHTML = `<span class="dot ${st[0]}"></span>${esc(st[1])}`;
  $("#bname").textContent = t("牧羊人");
  const d = new Date();
  $("#bsub").textContent = S.cloud === "ready" ? `${esc(myName())} · ${S.day.slice(5).replace("-", "/")} ${t("周{d}", { d: t(WEEKDAY[d.getDay()]) })}` : t("身心灵记录");
  renderAppSwitch();
  renderLangSwitch();
  document.querySelectorAll("nav.tabs button").forEach(b => { const k = TAB_LABELS[b.dataset.tab]; if (!k) return; const txt = [...b.childNodes].find(x => x.nodeType === 3); if (txt) txt.nodeValue = t(k); else b.append(t(k)); });
  { const b = $("#tkBadge"); if (b) { const n = S.tk && S.tk.loaded ? pendingCount() : 0; b.textContent = n > 9 ? "9+" : String(n || ""); b.hidden = !n; } }   // 任务页签角标：逾期 + 今天到期
}
function render(){
  renderStatus();
  const sub = SUB[S.tab], cur = sub ? sub.parent : S.tab;   // 子页时底部仍高亮它所属的页签
  document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === cur) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = sub ? sub.view : VIEWS[S.tab] || viewToday;
  $("#main").className = S.tab === "today" ? "wide" : "narrow";
  const crumb = sub ? crumbNav(crumbParts(S.tab)) : "";
  $("#main").innerHTML = crumb + (S.tab === "me" || sub ? v() : (gateHTML() || v()));   // 我的、咩咩咩 没登录也能看
  updateMiniBar($("#bname").textContent, sub ? crumbNav(crumbParts(S.tab), "mb") : "", t("回到顶部"));
}
function refreshSettingsIfOpen(){ if ($("#sheet").open && $("#sheetTitle") && $("#sheetTitle").textContent === t("设置")) openSettings(); }

/* 没登录 / 匿名 / 表没建时，每个页面都先把路指清楚 */
function gateHTML(){
  if (S.cloud === "loading") return `<div class="empty">${t("正在连接云端…")}</div>`;
  if (S.cloud === "offline") return `<div class="empty">${t("云端暂时不可用。")}<br>${t("请检查网络后刷新页面。")}</div>`;
  if (S.cloud === "signedout") return `<div class="empty">${t("用和小月亮一样的账号登录。这里记的是你自己的读经、祷告和身体，默认只有你自己看得到。")}<br><button class="btn primary" data-act="settings">${t("去登录")}</button> <button class="btn" data-act="about">${t("了解牧羊人")}</button></div>`;
  if (S.cloud === "anon") return `<div class="empty">${t("你是用邀请码进来的匿名身份。个人记录需要一个正式账号，先绑定邮箱。")}<br><button class="btn primary" data-act="settings">${t("绑定邮箱")}</button></div>`;
  if (S.wb.error === "missing") return `<div class="empty">${t("数据库还没有牧羊人的表。")}<br>${t("请在 Supabase 执行本地")} <code>supabase/migrations/013_shepherd.sql</code>${t("，然后刷新。")}</div>`;
  if (S.wb.error) return `<div class="empty">${t("读取数据失败。")}<br>${t("请刷新重试。")}</div>`;
  if (!S.wb.loaded) return `<div class="empty">${t("正在读取…")}</div>`;
  return "";
}

export { renderStatus, render, refreshSettingsIfOpen, gateHTML, crumbNav, SUB };
