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

export { $, esc, newId, H, D, pad, hm, dayKey, startOfDay, weekday, toast, loadJSON, saveJSON, debounce, readPaged };
