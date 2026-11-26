import { esc } from "./core/util.js";

/* ============ 共用的小图表（任务首页、健康概览等的 dashboard 用）============
   统一样式：圆角柱、柱顶数值、底部标签、最高的一根用主色、其余用浅色；颜色读语义变量，深浅色主题自动跟着变。 */

/** 柱状图。items: [{ label, v, hi? }]；hi = true 的柱子用强调色（例如今天 / 本月） */
function barsSVG(items, { h = 150, label = "", unit = "" } = {}){
  const W = 360, P = { l: 6, r: 6, t: 20, b: 22 }, n = Math.max(1, items.length), max = Math.max(1, ...items.map(x => x.v || 0));
  const bw = (W - P.l - P.r) / n, y = v => h - P.b - v / max * (h - P.t - P.b);
  const g = items.map((x, i) => {
    const bx = P.l + i * bw + bw * .18, w = bw * .64, top = y(x.v || 0), cx = (bx + w / 2).toFixed(1);
    return `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(2, h - P.b - top).toFixed(1)}" rx="3" fill="${x.hi ? "var(--slate)" : "var(--slate-soft)"}" stroke="${x.hi ? "none" : "var(--slate)"}" stroke-opacity=".35"/>`
      + (x.v && n <= 16 ? `<text x="${cx}" y="${(top - 5).toFixed(1)}" text-anchor="middle" class="bar-v">${x.v}</text>` : "")
      + `<text x="${cx}" y="${h - 6}" text-anchor="middle" class="bar-l">${esc(x.label)}</text>`;
  }).join("");
  return `<svg class="bars" viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(label)}${unit ? " · " + esc(unit) : ""}">${g}</svg>`;
}

/** 横条列表（占比）。items: [{ label, v, color, sub? }] */
function hbarsHTML(items){
  const max = Math.max(1, ...items.map(x => x.v));
  return `<div class="hbars">${items.map(x => `<div class="hb-row"><span class="hb-l">${x.label}</span><span class="hb-t"><i style="width:${Math.max(3, Math.round(x.v / max * 100))}%;background:${x.color || "var(--slate)"}"></i></span><b class="hb-n">${x.v}</b></div>`).join("")}</div>`;
}

export { barsSVG, hbarsHTML };
