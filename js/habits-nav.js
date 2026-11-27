import { t } from "./core/i18n.js";
import { esc } from "./core/util.js";

/* ============ 今天 / 习惯 的四个页面：顶部导航小卡片（四页都固定在页面最上面）============
   今日打卡（默认）· 回顾 · 记录 · 顶部卡片。点一张 = 去那一页（data-tab），当前页的那张高亮。 */
const PAGES = [["habits", "✓", "今日打卡"], ["review", "📈", "回顾"], ["records", "▤", "记录"], ["herocfg", "⏱", "顶部卡片"]];
const HABIT_TABS = new Set(PAGES.map(p => p[0]));

function habitsNavHTML(cur){
  return `<nav class="hnav" aria-label="${esc(t("习惯"))}">${PAGES.map(([tab, ico, label]) => `<button type="button" class="hnav-card" data-tab="${tab}"${tab === cur ? ' aria-current="page"' : ""}><span class="hnav-ico" aria-hidden="true">${ico}</span><span class="hnav-lbl">${esc(t(label))}</span></button>`).join("")}</nav>`;
}
export { habitsNavHTML, HABIT_TABS };
