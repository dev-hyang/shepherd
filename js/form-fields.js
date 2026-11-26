import { t } from "./core/i18n.js";
import { dayKey, esc } from "./core/util.js";

/* 表单里单个字段的 HTML。字段描述（spec）：
   k 键 · label 标签 · type（text / num / time / date / password / area / seg / multi / check / html）· ph 占位 · hint 说明
   w：宽度。省略 = 整行；"s" = 1/3 行；"m" = 1/2 行（电脑 ≥640px 才并排，手机一律单列）
   pre / suf：输入框前后的字（如「每周 [3] 次」），只用于 num / text / time；只有 pre / suf、没有 label 时，它们就是这个框的名字（读屏用 aria-label）
   sel：下拉（opts = [[值, 文字]]），选项 ≥ 9 项电脑上自动可搜索（shared/ui-select.js）；redraw: true = 改了值就重画表单（别的字段的 when 依赖它时用）
   fill：seg / multi 用统一的视图切换条 ui-seg，占满一行、按钮等宽（选项少、文字短时用，如「每天 / 每周」「周一…周日」） */
const segWrap = (f, id, label, btns) => f.fill ? `<div class="ui-seg" data-fill role="group" aria-labelledby="${id}">${btns}</div>` : `<div class="seg" role="group" aria-labelledby="${id}">${btns}</div>`;
const segBtns = (f, draft, attr) => (f.optsFn ? f.optsFn(draft) : f.opts).map(([val, lab]) => {
  const v = draft[f.k], on = attr === "multi" ? (v || []).map(String).includes(String(val)) : String(v) === String(val);
  return `<button type="button" data-${attr}="${f.k}" data-v="${esc(val)}" aria-pressed="${on}">${esc(f.raw ? lab : t(lab))}</button>`;
}).join("");
/** 输入框带前后缀时，包成一行：前缀 [框] 后缀 */
const nameless = (f, input) => f.label || !(f.pre || f.suf) ? input : input.replace("<input ", `<input aria-label="${esc([f.pre, f.suf].filter(Boolean).map(x => t(x)).join(" "))}" `);
const wrapIn = (f, raw) => { const input = nameless(f, raw); return (f.pre || f.suf) ? `<div class="fin${f.type === "num" ? " fin--num" : ""}">${f.pre ? `<span>${esc(t(f.pre))}</span>` : ""}${input}${f.suf ? `<span>${esc(t(f.suf))}</span>` : ""}</div>` : input; };

function fieldBody(f, draft){
  const v = draft[f.k], id = "f_" + f.k, label = t(f.label || ""), ph = esc(t(f.ph || ""));
  const lab = label ? `<label for="${id}">${label}</label>` : "";
  const hint = f.hint ? `<div class="small muted" style="margin-top:4px">${t(f.hint)}</div>` : "";
  switch (f.type) {
    case "seg": return `<div class="field"><div class="lab" id="${id}">${label}</div>${segWrap(f, id, label, segBtns(f, draft, "seg"))}${hint}</div>`;
    case "sel": return `<div class="field">${lab}<select id="${id}" data-f="${f.k}"${f.redraw ? " data-redraw" : ""}>${f.opts.map(([val, l]) => `<option value="${esc(val)}" ${String(v ?? "") === String(val) ? "selected" : ""}>${esc(f.raw ? l : t(l))}</option>`).join("")}</select>${hint}</div>`;
    case "multi": return `<div class="field"><div class="lab" id="${id}">${label}</div>${segWrap(f, id, label, segBtns(f, draft, "multi"))}${hint}</div>`;
    case "area": return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" data-f="${f.k}" placeholder="${ph}" ${f.rows ? `style="min-height:${f.rows * 24}px"` : ""}>${esc(v || "")}</textarea>${hint}</div>`;
    case "num": return `<div class="field">${lab}${wrapIn(f, `<input id="${id}" type="number" inputmode="decimal" min="0" step="${f.step || 1}" data-f="${f.k}" value="${v ?? ""}" placeholder="${ph}">`)}${hint}</div>`;
    case "time": return `<div class="field">${lab}${wrapIn(f, `<input id="${id}" type="time" data-f="${f.k}" value="${esc(v || "")}">`)}${hint}</div>`;
    case "date": return `<div class="field">${lab}<input id="${id}" type="date" data-f="${f.k}"${f.past ? ` max="${dayKey(Date.now())}"` : ""} value="${esc(v || "")}">${hint}</div>`;   // past：记录性质，不能选未来
    case "password": return `<div class="field">${lab}<input id="${id}" type="password" data-f="${f.k}" value="${esc(v || "")}" placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false">${hint}</div>`;
    case "check": return `<div class="field"><label class="check"><input type="checkbox" data-f="${f.k}" ${v ? "checked" : ""}>${label}</label>${hint}</div>`;
    case "html": return `<div class="field">${typeof f.html === "function" ? f.html(draft) : f.html}</div>`;
    default: {
      const list = f.list ? `<datalist id="${id}_list">${f.list.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : "";
      return `<div class="field">${lab}${wrapIn(f, `<input id="${id}" type="text" data-f="${f.k}" value="${esc(v || "")}" placeholder="${ph}" ${f.list ? `list="${id}_list"` : ""}>`)}${list}${hint}</div>`;
    }
  }
}
/** 一个字段；带 w 时给最外层 .field 加宽度类 */
export function fieldHtml(f, draft){
  if (f.when && !f.when(draft)) return "";
  const html = fieldBody(f, draft);
  return f.w && html ? html.replace('class="field"', `class="field field--${f.w}"`) : html;
}
/** 整张表单：放进 .fgrid（电脑上短字段可并排） */
export const fieldsHtml = (fields, draft) => `<div class="fgrid">${fields.map(f => fieldHtml(f, draft)).join("")}</div>`;
