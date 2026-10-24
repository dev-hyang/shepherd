import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";

/* ============ 共用版式（今天 / 任务 / 祷告 / 笔记 都用这几块，手机和电脑一致）============
   secHead：区块标题 + 右侧小按钮（同一种写法，不再每页各写各的 h2 + chip）。
   pageHead：页面标题 + 主按钮。
   fbar：“筛选 ▾ 按钮 + 搜索框 + 新增按钮”一行；点筛选弹出下拉面板，里面是各组选项。已选的筛选在下面显示成可点掉的小标签。
   面板开合状态记在 S.fpop（重画后保持展开），点面板外或按 Esc 收起（events.js）。 */
const secHead = (title, actions = "", sub = "") => `<div class="sec-head"><h2>${title}${sub ? ` <span class="sec-sub">${sub}</span>` : ""}</h2>${actions ? `<span class="sec-acts">${actions}</span>` : ""}</div>`;
const pageHead = (title, actions = "") => `<div class="page-head"><h1>${title}</h1>${actions ? `<span class="sec-acts">${actions}</span>` : ""}</div>`;
const chipBtn = (label, attrs, cls = "") => `<button class="chip ${cls}" ${attrs}>${label}</button>`;

/** groups: [{ label, opts: [{ label, attrs, on, count? }] }]，每组第一个选项是“不筛选”。q: { id, value, ph }。add: { attrs, label }。extra：面板底部的额外按钮 HTML */
function fbar({ id, groups = [], q = null, add = null, extra = "" }){
  const sel = groups.map(g => ({ g, cur: g.opts.find(o => o.on) })).filter(x => x.cur && x.cur !== x.g.opts[0]);
  const open = S.fpop === id;
  const pop = groups.length || extra ? `<div class="fpop" id="fpop-${id}" ${open ? "" : "hidden"} role="group" aria-label="${esc(t("筛选"))}">
    ${groups.map(g => `<div class="fgroup"><div class="flab">${esc(t(g.label))}</div><div class="chips" style="margin:0">${g.opts.map(o => `<button class="chip" ${o.attrs} aria-pressed="${!!o.on}">${o.label}${o.count != null ? ` <span class="cnt">${o.count}</span>` : ""}</button>`).join("")}</div></div>`).join("")}
    <div class="fpop-foot">${extra}<button class="chip" data-fpop="close" style="margin-left:auto">${t("完成")}</button></div></div>` : "";
  return `<div class="fbar-wrap"><div class="fbar">
    ${groups.length ? `<button class="fbtn ${sel.length ? "on" : ""}" data-fpop="${id}" aria-expanded="${open}" aria-controls="fpop-${id}"><span aria-hidden="true">⚲</span> ${t("筛选")}${sel.length ? ` <b class="fn">${sel.length}</b>` : ""}</button>` : ""}
    ${q ? `<input type="search" id="${q.id}" class="fq" value="${esc(q.value)}" placeholder="${esc(t(q.ph))}" aria-label="${esc(t(q.ph))}" enterkeyhint="search" autocomplete="off">` : ""}
    ${add ? `<button class="btn primary fadd" ${add.attrs}>＋ ${t(add.label)}</button>` : ""}
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

export { secHead, pageHead, chipBtn, fbar, togglePop, closePop };
