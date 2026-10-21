import { myName } from "./core/auth.js";
import { SISTER_APPS, THIS_APP } from "./core/config.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc } from "./core/util.js";
import { WEEKDAY } from "./data/kinds.js";
import { viewMe } from "./me.js";
import { viewPrayer } from "./prayer.js";
import { viewReview } from "./review.js";
import { openSettings } from "./sheet.js";
import { viewToday } from "./today.js";

/* ============ 渲染 ============ */
const TAB_LABELS = { today: "今天", prayer: "祷告", review: "回顾", me: "我的" };
const VIEWS = { today: viewToday, prayer: viewPrayer, review: viewReview, me: viewMe };
function renderStatus(){
  const st = { loading: ["", t("连接中")], offline: ["", t("云端不可用")], signedout: ["", t("未登录")], anon: ["", t("请绑定邮箱")],
    ready: ["ok", S.family ? t("家庭 · {n} 人", { n: Object.keys(S.members).length || 1 }) : t("个人")] }[S.cloud];
  $("#status").innerHTML = `<span class="dot ${st[0]}"></span>${esc(st[1])}`;
  $("#bname").textContent = t("牧羊人");
  const d = new Date();
  $("#bsub").textContent = S.cloud === "ready" ? `${esc(myName())} · ${S.day.slice(5).replace("-", "/")} ${t("周{d}", { d: t(WEEKDAY[d.getDay()]) })}` : t("身心灵记录");
  const i = SISTER_APPS.findIndex(a => a.id === THIS_APP), n = SISTER_APPS.length, prev = SISTER_APPS[(i - 1 + n) % n], next = SISTER_APPS[(i + 1) % n];
  const badge = (a, label) => `<a class="badge" href="${a.url}" title="${esc(t("切到{name}", { name: t(a.name) }))}" aria-label="${esc(t("切到{name}", { name: t(a.name) }))}">${label}</a>`;
  $("#apps").setAttribute("aria-label", t("切换姊妹应用"));
  $("#apps").innerHTML = badge(prev, `‹ ${esc(t(prev.short))}`) + badge(next, `${esc(t(next.short))} ›`);
  document.querySelectorAll("nav.tabs button").forEach(b => { const k = TAB_LABELS[b.dataset.tab]; if (!k) return; const txt = [...b.childNodes].find(x => x.nodeType === 3); if (txt) txt.nodeValue = t(k); else b.append(t(k)); });
}
function render(){
  renderStatus();
  document.querySelectorAll("nav.tabs button").forEach(b => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = VIEWS[S.tab] || viewToday;
  $("#main").innerHTML = S.tab === "me" ? v() : (gateHTML() || v());
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

export { renderStatus, render, refreshSettingsIfOpen, gateHTML };
