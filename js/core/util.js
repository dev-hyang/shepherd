/* ============ helpers（与小月亮 js/util.js 一致） ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const H = 3600e3, D = 86400e3;
const pad = n => String(n).padStart(2, "0");
const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
function weekday(ts){ return "周" + "日一二三四五六"[new Date(ts).getDay()]; }
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2400); }
const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch (e) { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const debounce = (fn, ms = 200) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
/** PostgREST 一次最多回 1000 行（max-rows），超出的被悄悄截掉：按 1000 行一页用 .range() 读，读到不满一页为止。
    build() 每次返回一个新的查询，并且要排好序、最后用唯一键兜底（如 .order("day").order("id")），翻页才不会漏行或重行。返回和 Supabase 一样的 { data, error } */
async function readPaged(build, size = 1000){
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) return { data: null, error };
    out.push(...(data || [])); if (!data || data.length < size) return { data: out, error: null };
  }
}

/** 后台重画（实时同步、切回前台重读、过午夜、计时器到点……）时保住正在填的表单：
    先记下容器里所有“改过但还没保存”的输入（value ≠ defaultValue、checked ≠ defaultChecked、选项 ≠ defaultSelected）和焦点 / 光标，
    redraw() 用 innerHTML 重画后按同样的键放回去。键：有 id 用 id，否则 最近带 id 的祖先 + name / data-f / data-bt+data-k + 第几个。
    没动过的输入照常跟着新数据更新；文件选择框没法放回（浏览器不允许），按键对上了也跳过。用户自己点的重画不要用这个（保存后表单本来就该清空） */
const FIELD_SEL = "input, textarea, select";
function fieldKeys(root){
  const seen = {}, out = [];
  root.querySelectorAll(FIELD_SEL).forEach(el => {
    let k;
    if (el.id) k = "#" + el.id;
    else {
      const host = el.parentElement && el.parentElement.closest("[id]"), d = el.dataset || {};
      k = (host && root.contains(host) ? host.id : "") + "|" + el.tagName + "|" + (el.name || d.f || (d.bt !== undefined ? d.bt + "." + d.k : "") || el.type || "");
    }
    const n = seen[k] = (seen[k] || 0) + 1;
    out.push([n > 1 ? k + "~" + n : k, el]);
  });
  return out;
}
function dirtyOf(el){
  if (el.type === "file") return null;
  if (el.type === "checkbox" || el.type === "radio") return el.checked !== el.defaultChecked ? { checked: el.checked } : null;
  if (el.tagName === "SELECT") return [...el.options].some(o => o.selected !== o.defaultSelected) ? { sel: [...el.options].filter(o => o.selected).map(o => o.value) } : null;
  return el.value !== el.defaultValue ? { value: el.value } : null;
}
function keepForms(root, redraw){
  if (!root) { redraw(); return; }
  const act = document.activeElement, saved = new Map();
  let focusKey = null, caret = null;
  for (const [k, el] of fieldKeys(root)) {
    const d = dirtyOf(el); if (d) saved.set(k, d);
    if (el === act) { focusKey = k; try { caret = [el.selectionStart, el.selectionEnd, el.selectionDirection]; } catch (e) {} }
  }
  const sx = window.scrollX, sy = window.scrollY;
  redraw();
  if (!saved.size && !focusKey) return;
  for (const [k, el] of fieldKeys(root)) {
    const d = saved.get(k);
    if (d && el.type !== "file") {
      if ("checked" in d) { if (el.type === "checkbox" || el.type === "radio") el.checked = d.checked; }
      else if ("sel" in d) { if (el.tagName === "SELECT") [...el.options].forEach(o => { o.selected = d.sel.includes(o.value); }); }
      else if (el.tagName !== "SELECT" && el.type !== "checkbox" && el.type !== "radio") el.value = d.value;
    }
    if (k === focusKey && !el.disabled) {
      try { el.focus({ preventScroll: true }); } catch (e) {}
      if (caret && caret[0] != null) { try { el.setSelectionRange(caret[0], caret[1], caret[2] || "none"); } catch (e) {} }
      if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo(sx, sy);
    }
  }
}

export { $, esc, newId, H, D, pad, hm, dayKey, startOfDay, weekday, toast, loadJSON, saveJSON, debounce, readPaged, keepForms };
