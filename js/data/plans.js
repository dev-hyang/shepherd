/* ============ 读经计划 ============
   每个计划是一串"段落"，读完一段就前进一格；换计划时各自的进度分开保存，不会丢。
   内置计划按章数自动生成（整本 1189 章），不含经文正文；今天页可以按段落抓取和合本 / 英文译本来读。
   也可以导入自己的计划（每行一段，如"创世记 1-3，神创造天地"）。
   段落结构：{ label, parts: [{ n: 书号, c1: 起始章, c2: 结束章 }], note } */
import { BOOKS, parseRef } from "./bible.js";

// 66 卷各有多少章（与 BOOKS 的书号一一对应）
const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
const bookZh = n => BOOKS[n - 1][1];
const seg = (n, c1, c2, note = "") => ({ label: c1 === c2 ? `${bookZh(n)} ${c1}` : `${bookZh(n)} ${c1}–${c2}`, parts: [{ n, c1, c2 }], note });

// 把 from..to 这些书卷按"每天约 perDay 章"切段，段落不跨书卷
function byChapters(from, to, perDay){
  const out = [];
  for (let n = from; n <= to; n++) {
    const ch = CHAPTERS[n - 1], k = Math.max(1, Math.round(ch / perDay)), size = ch / k;
    for (let i = 0; i < k; i++) { const c1 = Math.floor(i * size) + 1, c2 = i === k - 1 ? ch : Math.floor((i + 1) * size); out.push(seg(n, c1, c2)); }
  }
  return out;
}
function psalmsProverbs(){
  const out = [];
  for (let d = 1; d <= 31; d++) {
    const p1 = (d - 1) * 5 + 1, p2 = Math.min(150, d * 5);
    out.push({ label: `诗篇 ${p1}–${p2} · 箴言 ${d}`, parts: [{ n: 19, c1: p1, c2: p2 }, { n: 20, c1: d, c2: d }], note: "" });
  }
  return out;
}
const PLANS = [
  { id: "bible1y", name: "一年通读圣经", desc: "按正典顺序，每天约 3 章，一年读完整本。段落不跨书卷，所以总段数略多于 365。", items: byChapters(1, 66, 1189 / 365) },
  { id: "nt90", name: "新约 90 天", desc: "马太福音到启示录，每天约 3 章。", items: byChapters(40, 66, 260 / 90) },
  { id: "gospels30", name: "四福音 30 天", desc: "一个月把耶稣的生平读一遍，每天约 3 章。", items: byChapters(40, 43, 89 / 30) },
  { id: "psprov31", name: "诗篇与箴言 31 天", desc: "每天 5 篇诗篇加 1 章箴言，一个月读完诗篇和箴言；适合在通读之外作为晨更。", items: psalmsProverbs() },
  { id: "ot2y", name: "旧约两年", desc: "创世记到玛拉基书，每天约 1–2 章，两年读完。和新约 90 天交替也合适。", items: byChapters(1, 39, 929 / 730) }
];
const planById = id => PLANS.find(p => p.id === id) || null;

/* 导入：每行一段。"创世记 1-3" / "诗篇 1–5; 箴言 1" / "John 3"，逗号或全角逗号后面是备注。也接受 JSON [[label, note]] 或 [{label, note}]。 */
function parseSeg(text){
  const parts = [];
  for (const piece of String(text).split(/[;；+]/)) {
    const s = piece.trim().replace(/[：]/g, ":").replace(/[－—–~～]/g, "-"); if (!s) continue;
    const m = s.match(/^(.+?)\s*(\d+)(?:\s*-\s*(\d+))?$/); if (!m) return null;
    const p = parseRef(`${m[1]} ${m[2]}`); if (!p) return null;
    const c1 = +m[2], c2 = m[3] ? +m[3] : c1; if (c2 < c1 || c2 > CHAPTERS[p.n - 1]) return null;
    parts.push({ n: p.n, c1, c2 });
  }
  return parts.length ? parts : null;
}
function parsePlan(text){
  const s = String(text || "").trim(); if (!s) return [];
  if (s[0] === "[") { try { const j = JSON.parse(s); return j.map(x => Array.isArray(x) ? mk(x[0], x[1]) : mk(x.label || x.ref, x.note)).filter(Boolean); } catch (e) { return []; } }
  return s.split(/\r?\n/).map(line => { const i = line.search(/[,，]/); return i < 0 ? mk(line) : mk(line.slice(0, i), line.slice(i + 1)); }).filter(Boolean);
}
function mk(label, note){
  label = String(label || "").trim(); if (!label) return null;
  const parts = parseSeg(label);
  return { label: parts ? parts.map(p => p.c1 === p.c2 ? `${bookZh(p.n)} ${p.c1}` : `${bookZh(p.n)} ${p.c1}–${p.c2}`).join(" · ") : label, parts: parts || [], note: String(note || "").trim() };
}

export { PLANS, CHAPTERS, planById, parsePlan, bookZh };
