import { t } from "./core/i18n.js";
import { esc } from "./core/util.js";

/* 统计卡（今天、任务、祷告、健康的首页 dashboard 共用）。target：tab:<页签> | tab:<页签>:<子页> | pview:<祷告子页> | <元素 id>（滚动过去） */
function targetAttr(target){
  if (target.startsWith("tab:")) { const [, tab, pv] = target.split(":"); return `data-tab="${tab}"${pv ? ` data-pv="${pv}"` : ""}`; }
  if (target.startsWith("pview:")) return `data-pview="${target.slice(6)}"`;
  return `data-scroll="${target}"`;
}
/* 数字（完成/总数）+ 进度条 + 一行说明（还剩什么 / 全部完成 / 逾期）。全部做完变绿 */
function kpiCard({ label, value, unit = "", pct = null, sub = "", state = "", target }){
  const attr = targetAttr(target);
  return `<button class="kpi ${state}" ${attr}><span class="kl">${label}</span><span class="kv">${value}${unit ? `<small>${unit}</small>` : ""}</span>
    ${pct == null ? "" : `<span class="kbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${label}"><i style="width:${Math.round(pct)}%"></i></span>`}
    <span class="ks ${state === "warn" ? "warn" : ""}">${sub}</span></button>`;
}
/** 还剩哪几项：最多列两个名字，其余写“等 N 项” */
const leftText = names => (names.length <= 2 ? names.map(esc).join("、") : t("{a} 等 {n} 项", { a: names.slice(0, 2).map(esc).join("、"), n: names.length }));
export { kpiCard, leftText };
