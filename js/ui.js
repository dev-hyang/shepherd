import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { dirItems } from "./nav-tree.js";

/* ============ 共用版式（今天 / 任务 / 祷告 / 笔记 都用这几块，手机和电脑一致）============
   secHead：区块标题 + 右侧小按钮（同一种写法，不再每页各写各的 h2 + chip）。
   pageHead：页面标题 + 主按钮。
   fbar：“筛选 ▾ 按钮 + 搜索框 + 新增按钮”一行；点筛选弹出下拉面板，里面是各组选项。已选的筛选在下面显示成可点掉的小标签。
   面板开合状态记在 S.fpop（重画后保持展开），点面板外或按 Esc 收起（events.js）。 */
/* 按钮小图标（和爱家小助手的筛选 / 目录按钮同一套线条图标，颜色跟文字走） */
const svgIco = inner => `<svg class="fpop-ico" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICON_FILTER = svgIco(`<path d="M2 6h16M2 14h16"/><circle cx="7" cy="6" r="2.2" fill="var(--surface)"/><circle cx="13" cy="14" r="2.2" fill="var(--surface)"/>`);
const ICON_MENU = svgIco(`<path d="M3 5h14M3 10h14M3 15h14"/>`);
const secHead = (title, actions = "", sub = "") => `<div class="sec-head"><h2>${title}${sub ? ` <span class="sec-sub">${sub}</span>` : ""}</h2>${actions ? `<span class="sec-acts">${actions}</span>` : ""}</div>`;
/** 顶部路径（2026-11-12，和其他应用一样）：健康 / 概览、任务 / 计划、健康 / 就诊 / 10/30 年度体检。
    parts = [{ label, attrs }]：最后一项是当前页（加粗），前面的可点（attrs 是点了去哪的 data-*）；back = 「‹ 返回」按钮的属性（第三层才有）；actions = 右边的按钮。
    画的时候记在 S.route，迷你栏（往下滚后顶上那条）跟着显示同一条路径。 */
/** 统一的面包屑：[目录按钮] 路径 / 路径 / 当前页 [右边按钮]。没有「返回」按钮：往上一层点路径，回上一页用浏览器后退（网址和路径一致）。 */
function crumbHTML(parts, { actions = "", cls = "route" } = {}){
  const dir = cls.includes("mb") ? null : dirItems();   // 目录 = 整棵页面树（js/nav-tree.js），每页一样；迷你栏不画
  const dirBtn = dir && dir.length ? `<span class="fbar-wrap crumb-dir"><button type="button" class="crumb-menu" data-fpop="dir" aria-expanded="${S.fpop === "dir"}" aria-controls="fpop-dir" aria-label="${esc(t("目录"))}">${ICON_MENU}<span>${t("目录")}</span></button>
    <div class="fpop dirmenu" id="fpop-dir" ${S.fpop === "dir" ? "" : "hidden"} role="menu" aria-label="${esc(t("目录"))}"><div class="fpop-head"><b>${t("目录")}</b></div>${dir.map(d => `<button type="button" role="menuitem" class="dir-item" data-lvl="${d.lvl || 0}" ${d.attrs} ${d.on ? 'aria-current="page"' : ""}>${esc(d.label)}</button>`).join("")}</div></span>` : "";
  const trail = parts.map((x, i) => `${i ? '<span class="sep">/</span>' : ""}${i === parts.length - 1 ? `<b aria-current="page">${esc(x.label)}</b>` : `<button type="button" class="crumb-link" ${x.attrs || ""}>${esc(x.label)}</button>`}`).join("");
  return `<nav class="crumb ${cls}" aria-label="${esc(t("位置"))}">${dirBtn}${trail}${actions ? `<span class="route-acts">${actions}</span>` : ""}</nav>`;
}
/** 页面自己画路径：画的时候记在 S.route，迷你栏（往下滚后顶上那条）跟着显示同一条（迷你栏不带目录按钮） */
function routeNav(parts, opts = {}){ S.route = parts; return crumbHTML(parts, opts); }
/** 右下角圆形 ＋ 按钮（新增）：手机在底部页签上方，电脑贴右下角；label 给读屏器 */
const fab = (attrs, label) => `<button type="button" class="fab" ${attrs} aria-label="${esc(label)}" title="${esc(label)}"><span aria-hidden="true">＋</span></button>`;
const pageHead = (title, actions = "") => `<div class="page-head"><h1>${title}</h1>${actions ? `<span class="sec-acts">${actions}</span>` : ""}</div>`;
const chipBtn = (label, attrs, cls = "") => `<button class="chip ${cls}" ${attrs}>${label}</button>`;

/** groups: [{ label, opts: [{ label, attrs, on, count? }] }]，每组第一个选项是“不筛选”。q: { id, value, ph }。add: { attrs, label }。extra：面板底部的额外按钮 HTML */
function fbar({ id, groups = [], q = null, add = null, extra = "" }){
  const sel = groups.map(g => ({ g, cur: g.opts.find(o => o.on) })).filter(x => x.cur && x.cur !== x.g.opts[0]);
  const open = S.fpop === id;
  const pop = groups.length || extra ? `<div class="fpop" id="fpop-${id}" ${open ? "" : "hidden"} role="group" aria-label="${esc(t("筛选"))}"><div class="fpop-head"><b>${t("筛选")}</b></div>
    ${groups.map(g => `<div class="fgroup"><div class="flab">${esc(t(g.label))}</div><div class="chips" style="margin:0">${g.opts.map(o => `<button class="chip" ${o.attrs} aria-pressed="${!!o.on}">${o.label}${o.count != null ? ` <span class="cnt">${o.count}</span>` : ""}</button>`).join("")}</div></div>`).join("")}
    <div class="fpop-foot">${extra}<button class="chip" data-fpop="close" style="margin-left:auto">${t("完成")}</button></div></div>` : "";
  return `<div class="fbar-wrap"><div class="fbar">
    ${q ? `<input type="search" id="${q.id}" class="fq" value="${esc(q.value)}" placeholder="${esc(t(q.ph))}" aria-label="${esc(t(q.ph))}" enterkeyhint="search" autocomplete="off">` : ""}
    ${groups.length ? `<button class="fbtn ${sel.length ? "on" : ""}" data-fpop="${id}" aria-expanded="${open}" aria-controls="fpop-${id}">${ICON_FILTER}<span>${t("筛选")}</span>${sel.length ? `<b class="fn">${sel.length}</b>` : ""}</button>` : ""}
    ${add ? `<button class="ui-btn fadd" data-tone="primary" ${add.attrs}>＋ ${t(add.label)}</button>` : ""}
    ${pop}</div>
    ${sel.length ? `<div class="fsum">${sel.map(({ g, cur }) => `<button class="fchip" ${g.opts[0].attrs} aria-label="${esc(t("清除"))}">${esc(t(g.label))}：${cur.label} ✕</button>`).join("")}</div>` : ""}</div>`;
}
/** 点“筛选”开合面板（不重画）；返回是否处理了 */
function togglePop(id){
  const open = id !== "close" && S.fpop !== id; S.fpop = open ? id : null;
  document.querySelectorAll(".fpop").forEach(p => { p.hidden = p.id !== "fpop-" + S.fpop; });
  document.querySelectorAll(".fbtn").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.fpop === S.fpop)));
}
const closePop = () => { if (S.fpop) togglePop("close"); };

/** 右下角 ＋ 展开小菜单：items = [{ icon, label, attrs }]，点一项执行，点外面收起 */
const fabMenu = (items, label) => `<div class="fbar-wrap fab-wrap"><div class="fpop fab-menu" id="fpop-fab" ${S.fpop === "fab" ? "" : "hidden"} role="menu" aria-label="${esc(label)}">${items.map(i => `<button type="button" role="menuitem" class="dir-item" ${i.attrs}><span aria-hidden="true">${i.icon}</span>&nbsp;${esc(i.label)}</button>`).join("")}</div>
  <button type="button" class="fab" data-fpop="fab" aria-expanded="${S.fpop === "fab"}" aria-controls="fpop-fab" aria-label="${esc(label)}" title="${esc(label)}"><span aria-hidden="true">＋</span></button></div>`;
export { crumbHTML, fab, fabMenu, routeNav, secHead, pageHead, chipBtn, fbar, togglePop, closePop };
