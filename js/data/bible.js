/* ============ 圣经书卷、出处解析、经文抓取 ============
   三类来源，都从浏览器直接调用：
   1) getBible（api.getbible.net，无密钥，跨域开放）：和合本 cus、新译本 cns；KJV kjv、ASV asv。
   2) Free Use Bible API（bible.helloao.org，无密钥，跨域开放，静态 JSON）：BSB（Berean Standard Bible，公有领域的现代英语）、WEB、当代译本 cmn_cbs（Biblica 开放资源，需注明）。
   3) NLT API（api.nlt.to，Tyndale 官方；匿名按 IP 每天 500 次、每次 ≤50 节；返回 HTML，这里转成纯文本）。
   有版权且不开放跨域的（ESV、NASB、NIV、CSB、NKJV）走一个小代理（Supabase Edge Function，持有 api.esv.org / API.Bible 的密钥），在设置里填代理地址。 */
import { t } from "../core/i18n.js";
const BOOKS = [ // [书号, 中文, 中文简称, 英文, 英文缩写|…, USFM 三字码]
  [1, "创世记", "创", "Genesis", "Gen", "GEN"], [2, "出埃及记", "出", "Exodus", "Ex|Exod", "EXO"], [3, "利未记", "利", "Leviticus", "Lev", "LEV"], [4, "民数记", "民", "Numbers", "Num", "NUM"], [5, "申命记", "申", "Deuteronomy", "Deut|Dt", "DEU"],
  [6, "约书亚记", "书", "Joshua", "Josh", "JOS"], [7, "士师记", "士", "Judges", "Judg|Jdg", "JDG"], [8, "路得记", "得", "Ruth", "Ruth", "RUT"], [9, "撒母耳记上", "撒上", "1 Samuel", "1 Sam|1Sam|1 Sa", "1SA"], [10, "撒母耳记下", "撒下", "2 Samuel", "2 Sam|2Sam|2 Sa", "2SA"],
  [11, "列王纪上", "王上", "1 Kings", "1 Kgs|1Kgs|1 Ki", "1KI"], [12, "列王纪下", "王下", "2 Kings", "2 Kgs|2Kgs|2 Ki", "2KI"], [13, "历代志上", "代上", "1 Chronicles", "1 Chr|1Chr|1 Ch", "1CH"], [14, "历代志下", "代下", "2 Chronicles", "2 Chr|2Chr|2 Ch", "2CH"], [15, "以斯拉记", "拉", "Ezra", "Ezra", "EZR"],
  [16, "尼希米记", "尼", "Nehemiah", "Neh", "NEH"], [17, "以斯帖记", "斯", "Esther", "Esth|Est", "EST"], [18, "约伯记", "伯", "Job", "Job", "JOB"], [19, "诗篇", "诗", "Psalms", "Psalm|Ps|Pss", "PSA"], [20, "箴言", "箴", "Proverbs", "Prov|Pr", "PRO"],
  [21, "传道书", "传", "Ecclesiastes", "Eccl|Ecc", "ECC"], [22, "雅歌", "歌", "Song of Solomon", "Song|SoS|Song of Songs", "SNG"], [23, "以赛亚书", "赛", "Isaiah", "Isa|Is", "ISA"], [24, "耶利米书", "耶", "Jeremiah", "Jer", "JER"], [25, "耶利米哀歌", "哀", "Lamentations", "Lam", "LAM"],
  [26, "以西结书", "结", "Ezekiel", "Ezek|Eze", "EZK"], [27, "但以理书", "但", "Daniel", "Dan", "DAN"], [28, "何西阿书", "何", "Hosea", "Hos", "HOS"], [29, "约珥书", "珥", "Joel", "Joel", "JOL"], [30, "阿摩司书", "摩", "Amos", "Amos", "AMO"],
  [31, "俄巴底亚书", "俄", "Obadiah", "Obad|Ob", "OBA"], [32, "约拿书", "拿", "Jonah", "Jon", "JON"], [33, "弥迦书", "弥", "Micah", "Mic", "MIC"], [34, "那鸿书", "鸿", "Nahum", "Nah", "NAM"], [35, "哈巴谷书", "哈", "Habakkuk", "Hab", "HAB"],
  [36, "西番雅书", "番", "Zephaniah", "Zeph|Zep", "ZEP"], [37, "哈该书", "该", "Haggai", "Hag", "HAG"], [38, "撒迦利亚书", "亚", "Zechariah", "Zech|Zec", "ZEC"], [39, "玛拉基书", "玛", "Malachi", "Mal", "MAL"],
  [40, "马太福音", "太", "Matthew", "Matt|Mt", "MAT"], [41, "马可福音", "可", "Mark", "Mk", "MRK"], [42, "路加福音", "路", "Luke", "Lk", "LUK"], [43, "约翰福音", "约", "John", "Jn", "JHN"], [44, "使徒行传", "徒", "Acts", "Ac", "ACT"],
  [45, "罗马书", "罗", "Romans", "Rom", "ROM"], [46, "哥林多前书", "林前", "1 Corinthians", "1 Cor|1Cor|1 Co", "1CO"], [47, "哥林多后书", "林后", "2 Corinthians", "2 Cor|2Cor|2 Co", "2CO"], [48, "加拉太书", "加", "Galatians", "Gal", "GAL"], [49, "以弗所书", "弗", "Ephesians", "Eph", "EPH"],
  [50, "腓立比书", "腓", "Philippians", "Phil|Php", "PHP"], [51, "歌罗西书", "西", "Colossians", "Col", "COL"], [52, "帖撒罗尼迦前书", "帖前", "1 Thessalonians", "1 Thess|1Thess|1 Th", "1TH"], [53, "帖撒罗尼迦后书", "帖后", "2 Thessalonians", "2 Thess|2Thess|2 Th", "2TH"], [54, "提摩太前书", "提前", "1 Timothy", "1 Tim|1Tim|1 Ti", "1TI"],
  [55, "提摩太后书", "提后", "2 Timothy", "2 Tim|2Tim|2 Ti", "2TI"], [56, "提多书", "多", "Titus", "Tit", "TIT"], [57, "腓利门书", "门", "Philemon", "Philem|Phm", "PHM"], [58, "希伯来书", "来", "Hebrews", "Heb", "HEB"], [59, "雅各书", "雅", "James", "Jas", "JAS"],
  [60, "彼得前书", "彼前", "1 Peter", "1 Pet|1Pet|1 Pe", "1PE"], [61, "彼得后书", "彼后", "2 Peter", "2 Pet|2Pet|2 Pe", "2PE"], [62, "约翰一书", "约一", "1 John", "1 Jn|1Jn|1 Jo", "1JN"], [63, "约翰二书", "约二", "2 John", "2 Jn|2Jn|2 Jo", "2JN"], [64, "约翰三书", "约三", "3 John", "3 Jn|3Jn|3 Jo", "3JN"],
  [65, "犹大书", "犹", "Jude", "Jude", "JUD"], [66, "启示录", "启", "Revelation", "Rev", "REV"]
];
const norm = s => s.toLowerCase().replace(/[\s.．·]/g, "").replace(/[：:]/g, ":");
// 名字 → 书号（中文全名、中文简称、英文全名、英文缩写）
const BOOK_INDEX = new Map();
for (const [n, zh, zhAbbr, en, enAbbr] of BOOKS) { BOOK_INDEX.set(norm(zh), n); BOOK_INDEX.set(norm(zhAbbr), n); BOOK_INDEX.set(norm(en), n); for (const a of enAbbr.split("|")) BOOK_INDEX.set(norm(a), n); }
const book = n => BOOKS.find(b => b[0] === n);

/* "约翰福音 3:16-18" / "约 3：16" / "诗篇 23" / "1 John 4:19" / "Psalm 100" → { n, zh, en, usfm, chapter, from, to, label, labelEn } 或 null */
function parseRef(ref){
  const s = String(ref || "").trim().replace(/[：]/g, ":").replace(/[－—–~～]/g, "-").replace(/\s+/g, " ");
  const m = s.match(/^(.+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/); if (!m) return null;
  const name = norm(m[1]); if (!name) return null;
  const n = BOOK_INDEX.get(name); if (!n) return null;
  const b = book(n), chapter = +m[2], from = m[3] ? +m[3] : null, to = m[4] ? +m[4] : from;
  const vv = from ? ":" + from + (to && to !== from ? "-" + to : "") : "";
  return { n, zh: b[1], en: b[3], usfm: b[5], chapter, from, to, label: `${b[1]} ${chapter}${vv}`, labelEn: `${b[3]} ${chapter}${vv}` };
}
// API.Bible / USFM 式段落 id：JHN.3.16-JHN.3.18、PSA.23
const passageId = p => p.from == null ? `${p.usfm}.${p.chapter}` : `${p.usfm}.${p.chapter}.${p.from}${p.to && p.to !== p.from ? `-${p.usfm}.${p.chapter}.${p.to}` : ""}`;

/* ---- 来源表：版本标签 → { src, id } ---- */
const FROM = {
  getbible: { name: "getBible", url: "https://getbible.net/", need: "无，直接用" },
  helloao: { name: "Free Use Bible API", url: "https://bible.helloao.org/", need: "无，直接用" },
  nlt: { name: "Tyndale 官方 NLT API", url: "https://api.nlt.to/", need: "无；匿名按 IP 每天 500 次、每次 ≤50 节" },
  esv: { name: "Crossway ESV API", url: "https://api.esv.org/", need: "免费非商业密钥 + 代理" },
  apibible: { name: "API.Bible（美国圣经公会）", url: "https://scripture.api.bible/", need: "免费 Starter 密钥（非商业、每月 5000 次、从有版权译本里任选 3 本）+ 代理" }
};
// 每个译本：src 抓取方式 · id 来源里的编号 · zh 中文 · from 来源说明键 · about 一句话介绍 · rights 版权状态
const SOURCES = {
  // 中文
  "和合本": { src: "getbible", id: "cus", zh: true, from: "getbible", about: "1919 年国语和合本，华人教会最通用", rights: "公有领域" },
  "新译本": { src: "getbible", id: "cns", zh: true, from: "getbible", about: "环球圣经公会 1992 年现代中文译本", rights: "有版权，授权 CrossWire 分发" },
  "当代译本": { src: "helloao", id: "cmn_cbs", zh: true, from: "helloao", about: "Biblica 2010 年白话译本，孩子容易懂", rights: "Biblica 开放资源，需注明 © Biblica, Inc." },
  // 英文，无需密钥
  BSB: { src: "helloao", id: "BSB", from: "helloao", about: "Berean Standard Bible，2023 年起公有领域，措辞接近 ESV", rights: "公有领域" },
  NLT: { src: "nlt", from: "nlt", about: "New Living Translation，美国非宗派教会和儿童事工常用的意译本", rights: "© Tyndale，非商业引用需注明 NLT" },
  WEB: { src: "getbible", id: "web", from: "getbible", about: "World English Bible，ASV 的现代化修订；LORD 译作 Yahweh", rights: "公有领域" },
  KJV: { src: "getbible", id: "kjv", from: "getbible", about: "1611/1769 钦定本", rights: "公有领域（美国）" },
  ASV: { src: "getbible", id: "asv", from: "getbible", about: "1901 年美国标准本，直译", rights: "公有领域" },
  // 需代理（Edge Function 持密钥）
  ESV: { src: "proxy", from: "esv", about: "English Standard Version，改革宗与福音派教会常用", rights: "© Crossway" },
  NASB: { src: "proxy", from: "apibible", about: "New American Standard Bible（1995 / 2020），最直译", rights: "© Lockman Foundation" },
  NIV: { src: "proxy", from: "apibible", about: "New International Version 2011，美国销量最大的译本", rights: "© Biblica" },
  CSB: { src: "proxy", from: "apibible", about: "Christian Standard Bible，美南浸信会出版", rights: "© Holman" },
  NKJV: { src: "proxy", from: "apibible", about: "New King James Version，保留钦定本句式的现代拼写", rights: "© Thomas Nelson" }
};
const ZH = Object.fromEntries(Object.entries(SOURCES).filter(([, v]) => v.zh).map(([k]) => [k, k]));
const EN = Object.fromEntries(Object.entries(SOURCES).filter(([, v]) => !v.zh && v.src !== "proxy").map(([k]) => [k, k]));
const PROXY = Object.fromEntries(Object.entries(SOURCES).filter(([, v]) => v.src === "proxy").map(([k]) => [k, k]));
const canFetch = (version, proxy) => { const s = SOURCES[version]; return !!s && (s.src !== "proxy" || !!proxy); };
const needsProxy = version => !!SOURCES[version] && SOURCES[version].src === "proxy";

/* ---- 抓取 ---- */
const cache = new Map();
async function getJSON(url){
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url); if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const j = await r.json(); cache.set(url, j); return j;
}
const inRange = (p, v) => p.from == null || (v >= p.from && v <= p.to);
const clean = (t, zh) => String(t || "").replace(/\s+/g, zh ? "" : " ").replace(/^[「\s　]+/, "").trim();
const joinVerses = (parts, zh) => parts.filter(Boolean).join(zh ? "" : " ").replace(/\s+/g, zh ? "" : " ").trim();

async function fromGetBible(p, id, zh){
  const j = await getJSON(`https://api.getbible.net/v2/${id}/${p.n}/${p.chapter}.json`);
  const vs = (j.verses || []).filter(v => inRange(p, v.verse)); if (!vs.length) throw new Error(t("没有这节经文"));
  return joinVerses(vs.map(v => clean(v.text, zh)), zh);
}
// helloao：chapter.content = [{type:"verse", number, content:[ "文字" | {text, poem} | {noteId} | {lineBreak} | {wordsOfJesus:true, text}… ]}, {type:"heading"}…]
function helloaoText(items){
  const out = []; for (const it of items || []) { if (typeof it === "string") out.push(it); else if (it && typeof it.text === "string") out.push(it.text); }
  return out.join(" ");
}
async function fromHelloao(p, id, zh){
  const j = await getJSON(`https://bible.helloao.org/api/${id}/${p.usfm}/${p.chapter}.json`);
  const vs = ((j.chapter && j.chapter.content) || []).filter(c => c.type === "verse" && inRange(p, c.number)); if (!vs.length) throw new Error(t("没有这节经文"));
  return joinVerses(vs.map(v => clean(helloaoText(v.content), zh)), zh);
}
// NLT：返回 HTML 片段，去掉章节标题、小标题、节号、脚注，只留经文
async function fromNLT(p){
  const bookName = p.n === 22 ? "Song" : p.en; // NLT 叫 Song of Songs，接受 "Song"
  const ref = `${bookName}.${p.chapter}${p.from ? "." + p.from + (p.to && p.to !== p.from ? "-" + p.to : "") : ""}`;
  const url = `https://api.nlt.to/api/passages?ref=${encodeURIComponent(ref)}&version=NLT`;
  if (!cache.has(url)) { const r = await fetch(url); if (!r.ok) throw new Error(`NLT ${r.status}`); cache.set(url, await r.text()); }
  const doc = new DOMParser().parseFromString(cache.get(url), "text/html");
  const verses = [...doc.querySelectorAll("verse_export")]; if (!verses.length) throw new Error(t("没有这节经文"));
  for (const v of verses) for (const el of v.querySelectorAll("h2, h3, .subhead, .chapter-number, .vn, .tn, .a-tn, .psa-title, .psa-book")) el.remove();
  return joinVerses(verses.map(v => clean(v.textContent, false)), false);
}
async function fromProxy(p, version, proxy){
  const qs = `v=${encodeURIComponent(version)}&q=${encodeURIComponent(p.labelEn)}&pid=${encodeURIComponent(passageId(p))}`;
  const r = await fetch(`${proxy}${proxy.includes("?") ? "&" : "?"}${qs}`); if (!r.ok) throw new Error(`${version} ${t("代理")} ${r.status}`);
  const j = await r.json(); const text = clean(j.text || (j.passages && j.passages[0]) || "", false);
  if (!text) throw new Error(`${version} ${t("没有返回经文")}${j.error ? "：" + j.error : ""}`); return text;
}
// 取一段经文；返回 { text, version }。版本名就是用户看到的译本标签。
async function fetchPassage(ref, version, proxy){
  const p = typeof ref === "string" ? parseRef(ref) : ref; if (!p) throw new Error(t("看不懂这个出处"));
  const s = SOURCES[version]; if (!s) throw new Error(`${t("不支持自动抓取")} ${version}`);
  let text;
  if (s.src === "getbible") text = await fromGetBible(p, s.id, !!s.zh);
  else if (s.src === "helloao") text = await fromHelloao(p, s.id, !!s.zh);
  else if (s.src === "nlt") text = await fromNLT(p);
  else { if (!proxy) throw new Error(`${version} ${t("需要在设置里填代理地址")}`); text = await fromProxy(p, version, proxy); }
  return { text, version };
}

/* ---- 整章抓取（牧羊人加的）：读经计划一次读几章，返回 [{ v: 节号, text }] ----
   getBible（和合本 cus / 新译本 cns / WEB / KJV / ASV）和 helloao（BSB / 当代译本）都直接从浏览器取，无需密钥。 */
async function fetchChapter(n, chapter, version){
  const s = SOURCES[version]; if (!s || s.src === "proxy" || s.src === "nlt") throw new Error(`${t("不支持整章抓取")} ${version}`);
  const zh = !!s.zh;
  if (s.src === "getbible") {
    const j = await getJSON(`https://api.getbible.net/v2/${s.id}/${n}/${chapter}.json`);
    return (j.verses || []).map(v => ({ v: v.verse, text: clean(v.text, zh) }));
  }
  const b = book(n), j = await getJSON(`https://bible.helloao.org/api/${s.id}/${b[5]}/${chapter}.json`);
  return ((j.chapter && j.chapter.content) || []).filter(c => c.type === "verse").map(c => ({ v: c.number, text: clean(helloaoText(c.content), zh) }));
}

// 卡片标题：中英文出处并列，如 “诗篇 56:3 - Psalms 56:3”
const biRef = p => `${p.label} - ${p.labelEn}`;
// 去重用的键：老卡只有中文出处，新卡是中英并列，都归一到中文标签（去空格）；解析不了的按原文比较
function refKey(ref){ const first = String(ref || "").split(/\s+[-–—]\s+/)[0]; const p = parseRef(first); return (p ? p.label : String(ref || "")).replace(/\s+/g, ""); }

export { fetchChapter, BOOKS, SOURCES, FROM as SOURCE_FROM, parseRef, passageId, fetchPassage, canFetch, needsProxy, biRef, refKey, ZH as ZH_SOURCES, EN as EN_SOURCES, PROXY as PROXY_SOURCES };
