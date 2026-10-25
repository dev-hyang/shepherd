import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc, toast } from "./core/util.js";
import { LS_PREFIX } from "./core/config.js";
import { mdToHtml, mdToText } from "./markdown.js";
import { memberName } from "./core/auth.js";
import { PROVIDERS, aiReady, aiSettings, askText, providerOf, saveAiSettings, testAi } from "./ai.js";
import { NOTE_KINDS, monthsOf, onThisDay, OCR_SYSTEM, OCR_USER, PURPOSES, byNewest, compilePrompt, filterNotes, groupNotes, joinQuote, meta, noteHeading, parseOcr, parseTags, tagCounts, toMarkdown } from "./notes-lib.js";
import * as nt from "./nt.js";
import { chipBtn, fbar } from "./ui.js";
import { render } from "./views.js";
import { closeSheet, drawForm, getForm, head, openForm, openInfo, readForm, showSheet } from "./sheet.js";
import * as wb from "./wb.js";

/* ============ 灵修笔记：随手记 / 拍照识字 / 筛选查找 / 导出打印 / 分享给家人 / AI 整理 ============
   四种：读书心得、读经领受、遇到的问题、圣灵感动。拍照识字的原图只在内存里过一下，识别完就丢，不保存；
   识别出的段落由你点选要留哪几段，再写自己的心得。默认只有自己看得到，可以逐条分享给指定的家人（只读）。 */
const PAGE = 30;   // 一次最多画多少条，其余点“显示更多”
S.ntUi = { q: "", kind: "all", tag: "all", scope: "mine", group: "date", off: new Set(), month: null, limit: PAGE, exMonth: false };

const kindLabel = k => t((NOTE_KINDS[k] || NOTE_KINDS.reading).label);
const kindIcon = k => (NOTE_KINDS[k] || NOTE_KINDS.reading).icon;
const kindOpts = () => Object.entries(NOTE_KINDS).map(([k, v]) => [k, `${v.icon} ${t(v.label)}`]);
const nameOf = n => (nt.isMine(n) ? "" : memberName(n.user_id));
const others = () => Object.entries(S.members).filter(([u]) => S.user && u !== S.user.id);
const fileStamp = () => new Date().toISOString().slice(0, 10);

/* ---------- 列表 ---------- */
const current = () => (S.ntUi.scope === "shared" ? S.nt.shared : S.nt.mine);
/* 翻页规则：没有任何筛选（搜索 / 类型 / 标签）时按月翻页；有筛选就跨全部月份找，结果分页显示 */
const filtersOn = () => !!(S.ntUi.q.trim() || S.ntUi.kind !== "all" || S.ntUi.tag !== "all");
/** 当前月份："all" 或 "YYYY-MM"；没选过就是最新有笔记的那个月 */
function curMonth(){
  const ms = monthsOf(current()), m = S.ntUi.month;
  if (m === "all") return "all";
  if (m && ms.some(x => x[0] === m)) return m;
  return ms.length ? ms[0][0] : "all";
}
const matched = () => { const all = filterNotes(current(), S.ntUi).sort(byNewest), m = curMonth(); return !filtersOn() && m !== "all" ? all.filter(n => String(n.day).slice(0, 7) === m) : all; };
const shown = () => matched().slice(0, S.ntUi.limit);
const monthLabel = ym => t("{y} 年 {m} 月", { y: ym.slice(0, 4), m: +ym.slice(5, 7) });
function rowHTML(n){
  const mine = nt.isMine(n), n_sh = (n.shared_with || []).length;
  const body = mdToText(n.reflection || n.quote || "");
  return `<button class="nrow" data-act="note-open" data-id="${esc(n.id)}"><span class="ni" aria-hidden="true">${kindIcon(n.kind)}</span><span class="nt"><b>${esc(noteHeading(n, kindLabel))}</b>
    <small>${esc(n.day)} · ${esc(kindLabel(n.kind))}${mine ? "" : ` · ${esc(nameOf(n))}`}${mine && n_sh ? ` · 👥 ${t("{n} 人可见", { n: n_sh })}` : ""}</small>
    ${body ? `<span class="nsnip">${esc(body)}</span>` : ""}${(n.tags || []).length ? `<span class="ntags">${n.tags.map(x => `<span class="pill cat">#${esc(x)}</span>`).join(" ")}</span>` : ""}</span></button>`;
}
/** 月份导航：‹ 较早 | 选月份 | 较晚 ›；有筛选时换成一行说明 */
function navHTML(){
  if (filtersOn()) return `<p class="small muted" style="margin:6px 2px">${t("筛选中：在全部月份里找，共 {n} 条", { n: matched().length })}</p>`;
  const ms = monthsOf(current()); if (ms.length < 2 && curMonth() !== "all") return ms.length ? `<p class="small muted" style="margin:6px 2px">${esc(monthLabel(ms[0][0]))}</p>` : "";
  const cur = curMonth(), i = ms.findIndex(x => x[0] === cur), older = i >= 0 ? ms[i + 1] : null, newer = i > 0 ? ms[i - 1] : null;
  const years = [...new Set(ms.map(x => x[0].slice(0, 4)))];
  const opts = `<option value="all" ${cur === "all" ? "selected" : ""}>${esc(t("全部月份"))}（${current().length}）</option>` + years.map(y => `<optgroup label="${y}">${ms.filter(x => x[0].startsWith(y)).map(([ym, c]) => `<option value="${ym}" ${ym === cur ? "selected" : ""}>${esc(monthLabel(ym))}（${c}）</option>`).join("")}</optgroup>`).join("");
  return `<div class="monthnav"><button class="chip" data-ntf="month" data-v="${older ? older[0] : ""}" aria-label="${esc(t("较早的月份"))}" ${older ? "" : "disabled"}>‹</button>
    <select id="ntMonth" aria-label="${esc(t("选择月份"))}">${opts}</select>
    <button class="chip" data-ntf="month" data-v="${newer ? newer[0] : ""}" aria-label="${esc(t("较晚的月份"))}" ${newer ? "" : "disabled"}>›</button></div>`;
}
/** 历史上的今天：往年同一天写过的（只在我的、没有筛选时显示） */
function otdHTML(max = 3){
  if (filtersOn() || S.ntUi.scope !== "mine") return "";
  const list = onThisDay(S.nt.mine, S.day); if (!list.length) return "";
  return `<div class="panel otd" style="padding:4px 10px;margin-bottom:10px"><div class="glabel">🗓 ${t("历史上的今天")}</div>${list.slice(0, max).map(rowHTML).join("")}${list.length > max ? `<div class="small muted" style="padding:4px 6px">${t("还有 {n} 条", { n: list.length - max })}</div>` : ""}</div>`;
}
function bodyHTML(){
  const total = matched().length, more = total - shown().length;
  return `${otdHTML()}${navHTML()}<div class="panel" id="ntList" style="padding:4px 10px">${listHTML()}</div>${more > 0 ? `<div class="btns" style="margin-top:8px"><button class="btn" data-act="nt-more">${t("显示更多（还有 {n} 条）", { n: more })}</button></div>` : ""}`;
}
function listHTML(){
  const list = shown();
  if (list.length) return list.map(rowHTML).join("");
  const any = current().length;
  return `<div class="empty">${any ? t("这个筛选下没有笔记。") : S.ntUi.scope === "shared" ? t("家人还没有分享笔记给你。") : t("读书、读经、祷告时有心得、疑问或感动，随手记在这里，日积月累就是自己的参考。")}</div>`;
}
/** 笔记子页（在祷告页里）：筛选面板 + 搜索 + 新增，下面是历史上的今天、月份翻页、列表 */
function viewNotes(){
  if (S.nt.error === "missing") return `<div class="empty">${t("数据库还没有笔记表。")}<br>${t("请在 Supabase 执行")} <code>docs/016_shepherd_notes.sql</code>${t("，然后刷新。")}</div>`;
  if (S.nt.error || !S.nt.loaded) return `<div class="empty">${S.nt.error ? t("读取笔记失败，请刷新重试。") : t("正在读取…")}</div>`;
  const ui = S.ntUi, base = current(), tags = tagCounts(base);
  const opt = (k, v, label, count) => ({ label, attrs: `data-ntf="${k}" data-v="${esc(v)}"`, on: ui[k] === v, count });
  const cnt = k => (k === "all" ? base : base.filter(n => n.kind === k)).length;
  const groups = [
    ...(S.nt.shared.length ? [{ label: "来源", opts: [opt("scope", "mine", t("我的"), S.nt.mine.length), opt("scope", "shared", t("家人分享给我"), S.nt.shared.length)] }] : []),
    { label: "类型", opts: ["all", ...Object.keys(NOTE_KINDS)].map(k => opt("kind", k, k === "all" ? t("全部") : `${kindIcon(k)} ${esc(kindLabel(k))}`, cnt(k))) },
    ...(tags.length ? [{ label: "标签", opts: [opt("tag", "all", t("全部标签")), ...tags.slice(0, 30).map(([x, c]) => opt("tag", x, `#${esc(x)}`, c))] }] : [])];
  return `<div class="sec-acts-row">${ui.scope === "mine" && S.nt.mine.length ? chipBtn(t("导出 / 打印 / 整理"), 'data-act="note-export"') : ""}${chipBtn(t("AI 设置"), 'data-act="ai-settings"')}</div>
  ${fbar({ id: "nt", groups, q: { id: "ntQ", value: ui.q, ph: "搜索笔记" }, add: ui.scope === "mine" ? { attrs: 'data-act="note-add"', label: "笔记" } : null })}
  <div id="ntBody">${bodyHTML()}</div>
  <p class="small muted" style="margin-top:8px">${t("默认只有你自己看得到；每一条可以单独分享给指定的家人（对方只读）。拍照识字的照片不会被保存。")}</p>`;
}
/** 切到祷告页的“灵修笔记”子页（今天页、我的页、保存后的跳转都用这个） */
function openNotes(){
  S.tab = "prayer"; S.prayerView = "notes"; S.pick = null; S.fpop = null;
  closeSheet();   // 有表单开着就先关掉（会重画）；没开就直接重画
  window.scrollTo(0, 0); setTimeout(() => window.scrollTo(0, 0), 60);
}
/** 点筛选：scope / kind / tag */
function setFilter(k, v){ if (k === "month" && !v) return; S.ntUi[k] = v; S.ntUi.limit = PAGE; if (k === "scope") { S.ntUi.kind = "all"; S.ntUi.tag = "all"; S.ntUi.month = null; } render(); }
function moreNotes(){ S.ntUi.limit += PAGE; const b = $("#ntBody"); if (b) b.innerHTML = bodyHTML(); }
/** 搜索框每次输入只重画列表（不然光标会丢） */
function onSearch(v){ S.ntUi.q = v; S.ntUi.limit = PAGE; const box = $("#ntBody"); if (box) box.innerHTML = bodyHTML(); }

/* ---------- 看（只读，家人分享给我的）---------- */
function viewNote(n){
  openInfo("灵修笔记", `<div class="panel"><b>${esc(noteHeading(n, kindLabel))}</b><div class="small muted">${esc(meta(n, kindLabel))} · ${esc(nameOf(n) || "")}</div>
    ${n.quote ? `<blockquote class="nq">${esc(n.quote).replace(/\n/g, "<br>")}</blockquote>` : ""}${n.reflection ? `<div class="md">${mdToHtml(n.reflection)}</div>` : ""}</div>
    <p class="small muted">${t("这是家人分享给你的，只读。")}</p>`);
}

/* ---------- 记 / 改 ---------- */
const CONSENT = LS_PREFIX + ".ai-photo-ok";
const consented = () => { try { return localStorage.getItem(CONSENT) === "1"; } catch (e) { return false; } };
/** 摘录框里有没有这一段 */
const hasPara = (q, p) => String(q || "").includes(p);
function ocrHTML(d){
  const o = d.ocr, ready = aiReady();
  const pick = o && o.paragraphs.length ? `<div class="small muted" style="margin:8px 0 4px">${t("点选要留下的段落（可以再手动改）")} <button type="button" class="chip" data-act="nt-pick-all">${t("全选")}</button> <button type="button" class="chip" data-act="nt-pick-none">${t("清空")}</button></div>
    <div class="ocr-list">${o.paragraphs.map((p, i) => `<button type="button" class="ocr-p" data-act="nt-pick" data-i="${i}" aria-pressed="${hasPara(d.quote, p)}">${esc(p)}</button>`).join("")}</div>` : o ? `<p class="small" style="color:var(--rose)">${t("没有认出文字，换一张更清楚、光线更亮的照片再试。")}</p>` : "";
  return `<div class="field"><div class="lab">${t("拍照 / 选图识字（可选）")}</div>
    <label class="btn ${ready ? "" : "off"}" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer" ${ready ? "" : 'aria-disabled="true"'}>📷 ${d.ocrBusy ? t("识别中…") : t("拍照或选图")}
      <input id="ntPhoto" type="file" accept="image/*" multiple hidden ${ready && !d.ocrBusy ? "" : "disabled"}></label>
    ${ready ? "" : `<div class="small muted" style="margin-top:6px">${t("要自动识字，先在 设置 → AI 助手 填一个 key（免费的 Gemini 就行）。也可以用手机相册 / 相机的“实况文本”复制文字，粘贴到下面的摘录里。")}</div>`}
    <div class="small muted" style="margin-top:4px">${t("照片只发给你设置的 AI 服务商识别，牧羊人不保存照片。")}</div>${pick}</div>`;
}
function noteFields(){
  const fam = others();
  return [
    { k: "kind", label: "类型", type: "seg", opts: kindOpts(), raw: true },
    { k: "ocr", type: "html", html: ocrHTML },
    { k: "ref", label: "经文出处（可空）", type: "text", ph: "罗马书 8:26" },
    { k: "source", label: "书名 / 作者 / 页码（可空）", type: "text", ph: "《荣耀的中心》p.12" },
    { k: "quote", label: "摘录的原文（可空）", type: "area", rows: 4 },
    { k: "reflection", type: "html", html: mdEditorHTML },
    { k: "tags", label: "标签（逗号分隔，可空）", type: "text", ph: "信心, 祷告, 管教孩子" },
    { k: "tagsug", type: "html", html: () => { const tg = tagCounts(S.nt.mine).slice(0, 12); return tg.length ? `<div class="chips" style="margin:0">${tg.map(([x]) => `<button type="button" class="chip" data-act="nt-tag" data-tag="${esc(x)}">#${esc(x)}</button>`).join("")}</div>` : ""; } },
    { k: "day", label: "日期", type: "date" },
    ...(fam.length ? [{ k: "shared_with", label: "分享给（不选 = 只有自己看得到）", type: "multi", raw: true, opts: fam.map(([u, m]) => [u, m.name]), hint: "对方只能看，不能改。随时可以取消。" }]
      : [{ k: "noshare", type: "html", html: () => `<div class="small muted">${S.family ? t("家里没有其他成员，暂时没人可分享。") : t("加入家庭后，可以把某一条分享给指定的家人。")}</div>` }])
  ];
}
/** 打开记笔记表单。prefill: { kind, ref, source, quote }；photo = true 时直接弹出相机 / 相册（要在点击的同一次事件里调用） */
function openNoteForm(n, prefill = {}, { photo = false } = {}){
  if (S.nt.error || !S.nt.loaded) { openNotes(); return; }
  const isNew = !n;
  const draft = n ? { id: n.id, kind: n.kind, ref: n.ref, source: n.source, quote: n.quote, reflection: n.reflection, tags: (n.tags || []).join(", "), day: n.day, shared_with: [...(n.shared_with || [])], ai_used: !!n.ai_used }
    : { id: null, kind: prefill.kind || "reading", ref: prefill.ref || "", source: prefill.source || "", quote: prefill.quote || "", reflection: "", tags: "", day: wb.viewDay(), shared_with: [], ai_used: false };
  openForm(isNew ? "记一条笔记" : "编辑笔记", noteFields(), draft, async f => {
    if (!f.quote && !f.reflection) { toast(t("摘录和心得至少写一样")); return; }
    const used = !!f.ai_used && !!f.ocr && f.ocr.paragraphs.some(p => hasPara(f.quote, p));
    const d = await nt.saveNote({ ...f, ai_used: used || (!f.ocr && !!f.ai_used), tags: parseTags(f.tags), day: f.day || S.day });
    S.ntUi.month = String(d.day).slice(0, 7); S.ntUi.limit = PAGE;   // 回到列表时落在这条所在的月份
    toast(t("记下了"));
    closeSheet();
  }, isNew ? null : async () => { if (confirm(t("删除这条笔记？"))) { await nt.deleteNote(n.id); closeSheet(); } });
  if (photo) { const el = $("#ntPhoto"); if (el && !el.disabled) el.click(); else if (!aiReady()) toast(t("先在 设置 → AI 助手 填 key，或直接粘贴文字")); }
}
/* ---------- 心得：Markdown 编辑区（工具栏 + 编辑 / 预览 + 全屏写作）---------- */
const MD_BTNS = [["bold", "B", "粗体"], ["h", "H", "标题"], ["ul", "•", "列表"], ["ol", "1.", "编号"], ["quote", "❝", "引用"], ["ref", "✝", "插入出处"]];
function mdEditorHTML(d){
  const prev = !!d.mdPreview, label = t("我的心得、问题或感动");
  requestAnimationFrame(growText);
  return `<div class="mdbox" id="mdbox"><div class="mdhead"><label for="f_reflection" class="lab" style="margin:0">${label}</label>
    <span class="mdtools" role="toolbar" aria-label="${esc(t("格式"))}">${prev ? "" : MD_BTNS.map(([m, ic, l]) => `<button type="button" class="mdb" data-act="md" data-m="${m}" aria-label="${esc(t(l))}" title="${esc(t(l))}">${ic}</button>`).join("")}
      <button type="button" class="mdb wide" data-act="md-preview" aria-pressed="${prev}">${prev ? t("编辑") : t("预览")}</button><button type="button" class="mdb wide" data-act="md-full">${t("全屏")}</button></span></div>
    <textarea id="f_reflection" data-f="reflection" ${prev ? "hidden" : ""} placeholder="${esc(t("今天这段话让我想到……"))}">${esc(d.reflection || "")}</textarea>
    ${prev ? `<div class="md mdprev">${d.reflection ? mdToHtml(d.reflection) : `<span class="muted">${t("还没写内容")}</span>`}</div>` : ""}
    <details class="small muted" style="margin-top:6px"><summary>${t("Markdown 写法")}</summary><div style="padding:4px 0;line-height:1.7"><code># 标题</code> · <code>**粗体**</code> · <code>*斜体*</code> · <code>- 列表</code> · <code>1. 编号</code> · <code>&gt; 引用</code> · <code>---</code> · <code>[文字](https://…)</code><br>${t("不会写也没关系，直接写文字就行；单个换行会保留。")}</div></details></div>`;
}
const growText = () => { const el = $("#f_reflection"); if (el && !el.hidden) { el.style.height = "auto"; el.style.height = Math.min(Math.max(el.scrollHeight + 4, 140), Math.round(window.innerHeight * 0.7)) + "px"; } };
/** 工具栏：对选中的整行加前缀（再点一次取消）/ 给选中文字加粗 / 在光标处插入出处 */
function mdInsert(m){
  const el = $("#f_reflection"); if (!el || el.hidden) return;
  const a = el.selectionStart, b = el.selectionEnd, v = el.value;
  const setSel = (from, to) => { el.focus(); el.setSelectionRange(from, to); growText(); };
  if (m === "bold") { const sel = v.slice(a, b) || t("文字"); el.setRangeText("**" + sel + "**", a, b, "end"); setSel(a + 2, a + 2 + sel.length); return; }
  if (m === "ref") { const ref = ($('[data-f="ref"]') || {}).value || t("出处"), txt = "（" + ref + "）"; el.setRangeText(txt, a, b, "end"); setSel(a + txt.length, a + txt.length); return; }
  const lineStart = v.lastIndexOf("\n", a - 1) + 1, nl = v.indexOf("\n", b), lineEnd = nl < 0 ? v.length : nl;
  const block = v.slice(lineStart, lineEnd).split("\n"), pre = { h: "## ", ul: "- ", ol: "", quote: "> " }[m];
  const has = l => (m === "ol" ? /^\d+[.)]\s/.test(l) : l.startsWith(pre));
  const strip = l => (m === "ol" ? l.replace(/^\d+[.)]\s/, "") : l.slice(pre.length));
  const allOn = block.every(l => !l.trim() || has(l));
  const out = block.map((l, i) => (!l.trim() ? l : allOn ? strip(l) : (m === "ol" ? (i + 1) + ". " : pre) + l)).join("\n");
  el.setRangeText(out, lineStart, lineEnd, "end"); setSel(lineStart, lineStart + out.length);
}
function mdPreview(){ readForm(); const d = getForm().draft; d.mdPreview = !d.mdPreview; drawForm(); }
function mdFull(){
  const box = $("#mdbox"); if (!box) return; const on = box.classList.toggle("md-full");
  const b = box.querySelector('[data-act="md-full"]'); if (b) b.textContent = on ? t("退出全屏") : t("全屏");
  if (on) { const el = $("#f_reflection"); if (el && !el.hidden) el.focus(); }
  growText();
}
/** Esc：先退出全屏写作，而不是直接关掉整个表单 */
function exitFull(){ const box = document.querySelector("#mdbox.md-full"); if (!box) return false; mdFull(); return true; }

/** 缩小照片再发：长边 1600、JPEG 0.82，识字足够，也省流量和额度 */
async function shrink(file, max = 1600){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t("这张图片打不开"))); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { mime: "image/jpeg", b64: c.toDataURL("image/jpeg", 0.82).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }   // 原图只在内存里，识别完就释放
}
async function onPhotos(files){
  const list = [...files].slice(0, 4); if (!list.length || !getForm()) return;
  if (!consented()) {
    if (!confirm(t("照片会发给你在设置里选的 AI 服务商来识别文字；牧羊人不保存照片。继续吗？"))) return;
    try { localStorage.setItem(CONSENT, "1"); } catch (e) { /* 忽略 */ }
  }
  readForm(); const f = getForm().draft; f.ocrBusy = true; drawForm();
  try {
    const images = []; for (const x of list) images.push(await shrink(x));
    const r = parseOcr(await askText(OCR_SYSTEM, OCR_USER, { json: true, images, maxTokens: 3000 }));
    const cur = getForm(); if (!cur) return;
    readForm(); cur.draft.ocr = r; cur.draft.ai_used = r.paragraphs.length > 0 || cur.draft.ai_used;
    if (!cur.draft.source && (r.book || r.page)) cur.draft.source = [r.book, r.page ? `p.${r.page}` : ""].filter(Boolean).join(" ");
    if (r.paragraphs.length === 1 && !cur.draft.quote) cur.draft.quote = r.paragraphs[0];   // 只有一段：直接放进摘录，省一次点选
  } catch (e) { toast(String(e.message || e).slice(0, 140)); }
  const cur = getForm(); if (cur) { cur.draft.ocrBusy = false; drawForm(); }
}
function pickPara(i){
  readForm(); const d = getForm().draft, p = d.ocr && d.ocr.paragraphs[i]; if (p == null) return;
  if (hasPara(d.quote, p)) d.quote = d.quote.replace(p, "").replace(/\n{3,}/g, "\n\n").trim(); else d.quote = (d.quote ? d.quote + "\n\n" : "") + p;
  drawForm();
}
function pickAll(on){
  readForm(); const d = getForm().draft; if (!d.ocr) return;
  d.quote = on ? joinQuote(d.ocr.paragraphs, new Set(d.ocr.paragraphs.map((_, i) => i))) : d.ocr.paragraphs.reduce((q, p) => q.replace(p, ""), d.quote).replace(/\n{3,}/g, "\n\n").trim();
  drawForm();
}
function addTag(x){ readForm(); const d = getForm().draft, cur = parseTags(d.tags); if (!cur.includes(x)) cur.push(x); d.tags = cur.join(", "); drawForm(); }
/** 点一行：自己的进编辑，家人分享的只读 */
function openNote(id){ const n = nt.note(id); if (!n) return; if (nt.isMine(n)) openNoteForm(n); else viewNote(n); }

/* ---------- 导出 / 打印 / AI 整理 ---------- */
/** 导出范围：有筛选就是筛选结果（跨全部月份），没有就是全部笔记；在月份视图里可以勾“只导出这个月” */
const monthMode = () => !filtersOn() && curMonth() !== "all";
const exportList = () => { const all = filterNotes(S.nt.mine, S.ntUi).sort(byNewest); return S.ntUi.exMonth && monthMode() ? all.filter(n => String(n.day).slice(0, 7) === curMonth()) : all; };
const picked = () => exportList().filter(n => !S.ntUi.off.has(n.id));
function openExport(){
  const ui = S.ntUi, list = exportList(), sel = picked();
  const groups = [["date", "按月份"], ["kind", "按类型"], ["tag", "按标签"]];
  $("#sheetIn").innerHTML = `${head(t("导出 / 打印 / 整理"))}
  <p class="small muted">${t("范围 = 笔记页当前的筛选结果（类型、标签、搜索）；没有筛选就是全部笔记。下面可以逐条取消。已选 {a} / {b} 条。", { a: sel.length, b: list.length })}</p>
  ${monthMode() ? `<div class="field"><button class="chip" data-act="nt-exmonth" aria-pressed="${ui.exMonth}">${t("只导出 {m}", { m: monthLabel(curMonth()) })}</button></div>` : ""}
  <div class="field"><div class="lab">${t("整理方式")}</div><div class="seg" role="group" aria-label="${t("整理方式")}">${groups.map(([k, l]) => `<button data-ntf="group" data-v="${k}" data-export="1" aria-pressed="${ui.group === k}">${t(l)}</button>`).join("")}</div></div>
  <div class="panel" style="padding:4px 10px;max-height:46vh;overflow:auto">${list.length ? list.map(n => `<button class="nrow xrow" data-act="nt-x" data-id="${esc(n.id)}" aria-pressed="${!ui.off.has(n.id)}"><span class="ni" aria-hidden="true">${ui.off.has(n.id) ? "☐" : "☑"}</span><span class="nt"><b>${esc(noteHeading(n, kindLabel))}</b><small>${esc(n.day)} · ${esc(kindLabel(n.kind))}</small></span></button>`).join("") : `<div class="empty">${t("没有可导出的笔记。")}</div>`}</div>
  <div class="btns"><button class="btn primary" data-act="nt-preview" ${sel.length ? "" : "disabled"}>${t("预览 / 打印")}</button><button class="btn" data-act="nt-md" ${sel.length ? "" : "disabled"}>${t("下载 Markdown")}</button><button class="btn" data-act="nt-json" ${sel.length ? "" : "disabled"}>${t("下载 JSON（备份）")}</button><button class="btn" data-act="nt-copy" ${sel.length ? "" : "disabled"}>${t("复制文字")}</button></div>
  <h2>${t("让 AI 帮忙整理")}</h2>
  <div class="panel"><p class="small" style="margin-top:0">${t("把选中的笔记整理成一份草稿：请教牧师 / 长者的清单、写给家人朋友的书信，或给孩子讲解的材料。会把选中笔记的文字发给你设置的 AI 服务商；只用笔记里已有的内容。")}</p>
    <div class="btns" style="margin-top:0">${Object.entries(PURPOSES).map(([k, v]) => `<button class="btn" data-act="nt-ai" data-p="${k}" ${sel.length ? "" : "disabled"}>${t(v.label)}</button>`).join("")}</div>
    ${aiReady() ? "" : `<p class="small muted" style="margin-bottom:0">${t("还没填 AI key：点上面的按钮会复制一段提示词，你可以粘贴到任何 AI 网页里。")}</p>`}</div>
  <p class="small muted">${t("只导出你自己的笔记；家人分享给你的不在其中。")}</p>`;
  showSheet();
}
function toggleExMonth(){ S.ntUi.exMonth = !S.ntUi.exMonth; S.ntUi.off.clear(); openExport(); }
function toggleExport(id){ const off = S.ntUi.off; if (off.has(id)) off.delete(id); else off.add(id); openExport(); }
const mdOpts = () => ({ title: t("灵修笔记"), group: S.ntUi.group, kindLabel, labels: { quote: t("摘录"), thought: t("心得"), ai: t("（摘录经 AI 识字，请核对原文）") } });
const download = (name, text, mime) => {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
};
function exportMd(){ download(`${t("灵修笔记")}-${fileStamp()}.md`, toMarkdown(picked(), mdOpts()), "text/markdown"); }
function exportJson(){
  const notes = picked().map(({ day, kind, ref, source, quote, reflection, tags, ai_used, created_at }) => ({ day, kind, ref, source, quote, reflection, tags, ai_used, created_at }));
  download(`shepherd-notes-${fileStamp()}.json`, JSON.stringify({ app: "shepherd", exported_at: new Date().toISOString(), notes }, null, 2), "application/json");
}
async function copyText(text){ try { await navigator.clipboard.writeText(text); toast(t("已复制")); } catch (e) { toast(t("请手动复制")); } }
const copyMd = () => copyText(toMarkdown(picked(), mdOpts()));
/** 预览页：和打印出来的一样；顶栏和按钮打印时自动隐藏 */
function docHTML(notes){
  return groupNotes(notes, S.ntUi.group, kindLabel).map(g => `${g.title ? `<h2>${esc(g.title)}</h2>` : ""}${g.notes.map(n => `<section class="pn"><h3>${esc(noteHeading(n, kindLabel))}</h3><div class="pm">${esc(meta(n, kindLabel))}</div>
    ${n.quote ? `<blockquote class="nq">${esc(n.quote).replace(/\n/g, "<br>")}${n.ai_used ? `<div class="pm">${t("（摘录经 AI 识字，请核对原文）")}</div>` : ""}</blockquote>` : ""}${n.reflection ? `<div class="md">${mdToHtml(n.reflection)}</div>` : ""}</section>`).join("")}`).join("");
}
function openPreview(){
  const sel = picked();
  $("#sheetIn").innerHTML = `${head(t("预览"), `<button class="iconbtn" data-act="nt-print">${esc(t("打印 / 存成 PDF"))}</button>`)}
  <div class="notedoc"><h1>${esc(t("灵修笔记"))}</h1><div class="pm">${esc(t("共 {n} 条", { n: sel.length }))} · ${fileStamp()}</div>${docHTML(sel)}</div>
  <div class="btns noprint"><button class="btn primary" data-act="nt-print">${t("打印 / 存成 PDF")}</button><button class="btn" data-act="note-export">${t("返回")}</button></div>`;
  showSheet();
}
/** AI 整理：有 key 就直接生成草稿；没有就复制提示词 */
async function compileWithAi(purpose){
  const sel = picked(); if (!sel.length) return;
  const { system, user } = compilePrompt(purpose, sel, { kindLabel, lang: aiLang() });
  if (!aiReady()) { await copyText(`${system}\n\n${user}`); return; }
  if (!confirm(t("会把选中的 {n} 条笔记的文字发给你设置的 AI 服务商来整理。继续吗？", { n: sel.length }))) return;
  toast(t("整理中，请稍等…"));
  let text; try { text = await askText(system, user, { maxTokens: 3000, temperature: 0.5 }); } catch (e) { toast(String(e.message || e).slice(0, 160)); return; }
  openResult(t(PURPOSES[purpose].label), text);
}
const aiLang = () => (document.documentElement.lang === "en" ? "en" : "zh");
let lastResult = "";   // AI 草稿的原文（复制 / 下载用原文，不用渲染后的文字）
function openResult(title, text){
  lastResult = text;
  $("#sheetIn").innerHTML = `${head(esc(title))}
  <p class="small muted noprint">${t("AI 写的草稿，请逐句核对后再用；笔记原文没有的内容不要照搬。")}</p>
  <div class="notedoc"><h1>${esc(title)}</h1><div class="pm">${fileStamp()}</div><div class="md" id="ntResult">${mdToHtml(text)}</div></div>
  <div class="btns noprint"><button class="btn primary" data-act="nt-print">${t("打印 / 存成 PDF")}</button><button class="btn" data-act="nt-copy-result">${t("复制")}</button><button class="btn" data-act="nt-dl-result" data-title="${esc(title)}">${t("下载文本")}</button><button class="btn" data-act="note-export">${t("返回")}</button></div>`;
  showSheet();
}
const resultText = () => lastResult;

/* ---------- AI 设置 ---------- */
function openAiSettings(after){
  const s = aiSettings(), p = providerOf(s.provider);
  openForm("AI 助手", [
    { k: "provider", label: "服务商", type: "seg", opts: PROVIDERS.map(x => [x.id, x.name]) },
    { k: "key", label: "API key", type: "password", ph: "粘贴你自己的 key", hint: "只存在这台设备的浏览器里，不上传、不同步给家人。" },
    { k: "model", label: "模型（可空，用默认）", type: "text", ph: p.model },
    { k: "base", label: "接口地址（只有“自定义”要填）", type: "text", ph: "https://…/v1", when: d => d.provider === "custom" },
    { k: "help", type: "html", html: d => { const q = providerOf(d.provider); return `<div class="small muted">${t(q.hint)}${q.signup ? ` <a href="${esc(q.signup)}" target="_blank" rel="noopener">${t("申请 key")}</a>` : ""}</div>${s.borrowed && d.key === s.key ? `<div class="small" style="margin-top:6px">${t("这里用的是你在爱家小助手里填的 key。")}</div>` : ""}<div class="btns" style="margin-top:8px"><button type="button" class="btn" data-act="ai-test">${t("测试连接")}</button></div>` } }
  ], { provider: s.provider, key: s.key, model: s.model, base: s.base },
  async f => { saveAiSettings({ provider: f.provider, key: f.key, model: f.model, base: f.base }); toast(t("已保存")); closeSheet(); if (after) after(); });
}
async function runAiTest(){
  readForm(); const f = getForm().draft; saveAiSettings({ provider: f.provider, key: f.key, model: f.model, base: f.base });
  toast(t("测试中…"));
  try { await testAi(); toast(t("连接成功 ✓")); } catch (e) { toast(String(e.message || e).slice(0, 160)); }
}

export { viewNotes, otdHTML, moreNotes, toggleExMonth, mdInsert, mdPreview, mdFull, exitFull, growText, openNotes, openNote, openNoteForm, setFilter, onSearch, onPhotos, pickPara, pickAll, addTag, openExport, toggleExport, openPreview, exportMd, exportJson, copyMd, copyText, resultText, compileWithAi, openResult,
  openAiSettings, runAiTest, kindLabel };
