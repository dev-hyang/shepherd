/* ============ 灵修笔记 · 纯逻辑（不碰 DOM、不碰网络，node 里可直接测：tests/notes-lib.test.mjs） ============
   筛选、标签、分组、导出成 Markdown、拍照识字结果解析、给 AI 的提示词。界面文字由调用方传入（labels），这里不翻译。 */

const NOTE_KINDS = {
  reading:   { label: "读书心得",   icon: "📖" },
  scripture: { label: "读经领受",   icon: "✝" },
  question:  { label: "遇到的问题", icon: "❓" },
  spirit:    { label: "圣灵感动",   icon: "🕊" }
};
const kindKeys = () => Object.keys(NOTE_KINDS);

/** "信心, 祷告；信心" → ["信心","祷告"]：逗号 / 顿号 / 分号 / 空白都能分，去重，每个最多 20 字，最多 12 个 */
function parseTags(s){
  const seen = new Set(), out = [];
  for (const raw of String(s || "").split(/[,，、;；\s#]+/)) {
    const x = raw.trim().slice(0, 20); const k = x.toLowerCase();
    if (x && !seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out.slice(0, 12);
}

const haystack = n => [n.ref, n.source, n.quote, n.reflection, (n.tags || []).join(" ")].join("\n").toLowerCase();
/** 搜索词按空白切开，每个词都要命中（出处、书名、摘录、心得、标签）；kind / tag 为 "all" 或空表示不筛 */
function filterNotes(notes, { q = "", kind = "all", tag = "all" } = {}){
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter(n => (kind === "all" || !kind || n.kind === kind) && (tag === "all" || !tag || (n.tags || []).includes(tag)) && words.every(w => haystack(n).includes(w)));
}
/** 新的在前：先按记录日，同一天按创建时间 */
const byNewest = (a, b) => (b.day || "").localeCompare(a.day || "") || String(b.created_at || "").localeCompare(String(a.created_at || ""));
const byOldest = (a, b) => -byNewest(a, b);

function tagCounts(notes){
  const m = new Map();
  for (const n of notes) for (const x of n.tags || []) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** 分组：date（按月，旧的在前，读起来像日记）/ kind / tag（一条笔记有几个标签就出现几次）/ none */
function groupNotes(notes, by, kindLabel = k => k){
  const list = [...notes].sort(byOldest);
  if (by === "kind") return kindKeys().map(k => ({ title: kindLabel(k), notes: list.filter(n => n.kind === k) })).filter(g => g.notes.length);
  if (by === "tag") {
    const out = tagCounts(notes).map(([tg]) => ({ title: "#" + tg, notes: list.filter(n => (n.tags || []).includes(tg)) }));
    const none = list.filter(n => !(n.tags || []).length); if (none.length) out.push({ title: "", notes: none });
    return out;
  }
  if (by === "month") {
    const m = new Map(); for (const n of list) { const k = String(n.day || "").slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(n); }
    return [...m.entries()].map(([title, ns]) => ({ title, notes: ns }));
  }
  return [{ title: "", notes: list }];
}

/** 每条笔记的小标题：出处 / 书名，没有就用类型 */
const noteHeading = (n, kindLabel = k => k) => n.ref || n.source || kindLabel(n.kind);
const meta = (n, kindLabel = k => k) => [n.day, kindLabel(n.kind), n.ref && n.source ? n.source : "", ...(n.tags || []).map(x => "#" + x)].filter(Boolean).join(" · ");

/** 导出成 Markdown。opts: { title, group, kindLabel, nameOf(note) 别人的笔记署名, labels: { quote, thought, ai } } */
function toMarkdown(notes, { title = "", group = "date", kindLabel = k => k, nameOf = null, labels = {} } = {}){
  const L = { quote: "摘录", thought: "心得", ai: "（摘录经 AI 识字，请核对原文）", ...labels };
  const out = [];
  if (title) out.push(`# ${title}`, "");
  for (const g of groupNotes(notes, group, kindLabel)) {
    if (g.title) out.push(`## ${g.title}`, "");
    for (const n of g.notes) {
      out.push(`### ${noteHeading(n, kindLabel)}`, `*${meta(n, kindLabel)}${nameOf && nameOf(n) ? " · " + nameOf(n) : ""}*`, "");
      if (n.quote) out.push(...n.quote.split("\n").map(l => `> ${l}`), n.ai_used ? `> ${L.ai}` : "", "");
      if (n.reflection) out.push(n.reflection, "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/* ---- 拍照识字 ---- */
const OCR_SYSTEM = "You are an OCR assistant for a Christian devotional journal. Read the text in the photo exactly as printed (Chinese or English, keep the original language and punctuation, do not translate, do not summarize, do not correct). Split it into paragraphs in reading order. Reply with JSON only.";
const OCR_USER = 'Return JSON in exactly this shape: {"paragraphs":["paragraph 1","paragraph 2"],"book":"book title if visible else empty","page":"page number if visible else empty"}. If there is no readable text, return {"paragraphs":[]}.';
/** 模型回复 → { paragraphs, book, page }；优先按 JSON，不是 JSON 就按空行切段；只当文本用，不执行任何内容 */
function parseOcr(text){
  const s = String(text || "");
  const clean = v => String(v == null ? "" : v).replace(/\s+\n/g, "\n").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (Array.isArray(j.paragraphs)) return { paragraphs: j.paragraphs.map(clean).filter(Boolean).slice(0, 60), book: clean(j.book).slice(0, 80), page: clean(j.page).slice(0, 20) };
    } catch (e) { /* 下面按纯文本处理 */ }
  }
  return { paragraphs: s.replace(/```[a-z]*/gi, "").split(/\n\s*\n/).map(clean).filter(Boolean).slice(0, 60), book: "", page: "" };
}
/** 选中的段落合成摘录（保持顺序） */
const joinQuote = (paragraphs, picked) => paragraphs.filter((_, i) => picked.has(i)).join("\n\n");

/* ---- 给 AI 整理笔记 ---- */
const PURPOSES = {
  ask:    { label: "请教清单（给牧师 / 长者）", ask: "把这些笔记整理成一份带着去请教牧师或属灵长者的清单：先用 3-5 句话概括我最近在思考什么，再列出我真正想请教的问题（按重要程度排序，每个问题附上相关经文或我的原话），最后列出我已有的领受，方便对方了解我的处境。" },
  letter: { label: "书信草稿", ask: "把这些笔记整理成一封写给家人或朋友的书信草稿：语气真诚温暖，自然引用其中的经文和领受，不说教，不编造笔记里没有的事。" },
  teach:  { label: "给孩子讲解", ask: "把这些笔记整理成一份给孩子讲解的材料：用孩子听得懂的话讲一个核心信息，配一个生活里的比方，列出 2-3 个可以和孩子讨论的问题。不编造笔记里没有的事。" }
};
function compilePrompt(purpose, notes, { kindLabel = k => k, lang = "zh" } = {}){
  const p = PURPOSES[purpose] || PURPOSES.ask;
  const system = lang === "en"
    ? "You help a Christian organize their own devotional notes. Use only what is in the notes; do not invent facts or scripture. Write in the same language as the notes. Plain text, light structure."
    : "你帮一位基督徒整理他自己的灵修笔记。只使用笔记里已有的内容，不要编造事实或经文；用笔记的语言写；纯文本，结构简洁。";
  const body = [...notes].sort(byOldest).map((n, i) => [`【${i + 1}】${meta(n, kindLabel)}${n.ref ? " · " + n.ref : ""}`, n.quote ? `摘录：${n.quote}` : "", n.reflection ? `心得：${n.reflection}` : ""].filter(Boolean).join("\n")).join("\n\n");
  return { system, user: `${p.ask}\n\n笔记：\n${body}` };
}

export { NOTE_KINDS, kindKeys, parseTags, filterNotes, byNewest, byOldest, tagCounts, groupNotes, noteHeading, meta, toMarkdown,
  OCR_SYSTEM, OCR_USER, parseOcr, joinQuote, PURPOSES, compilePrompt };
