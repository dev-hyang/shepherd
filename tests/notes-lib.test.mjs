// node --test tests/notes-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseTags, filterNotes, groupNotes, toMarkdown, parseOcr, joinQuote, tagCounts, compilePrompt, monthsOf, onThisDay,
  searchWords, filtersOn, noteArgs, statsArgs, cursorArgs, pageSlice, effMonth } from "../js/notes-lib.js";

const N = [
  { id: "a", kind: "reading", day: "2026-10-01", created_at: "2026-10-01T08:00:00Z", ref: "", source: "荣耀的中心 p.12", quote: "神的荣耀在于\n祂的怜悯", reflection: "今天特别需要提醒", tags: ["信心", "祷告"], ai_used: true },
  { id: "b", kind: "spirit", day: "2026-10-05", created_at: "2026-10-05T08:00:00Z", ref: "罗马书 8:26", source: "", quote: "", reflection: "圣灵为我们祷告", tags: ["祷告"] },
  { id: "c", kind: "question", day: "2026-11-02", created_at: "2026-11-02T08:00:00Z", ref: "", source: "", quote: "", reflection: "如何面对愤怒？", tags: [] }
];

test("parseTags: 多种分隔符、去重、限长", () => {
  assert.deepEqual(parseTags("信心, 祷告；信心、#感恩  Hope"), ["信心", "祷告", "感恩", "Hope"]);
  assert.deepEqual(parseTags(""), []);
  assert.equal(parseTags("x".repeat(50))[0].length, 20);
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => "t" + i).join(",")).length, 12);
});

test("filterNotes: 搜索词都要命中，类型和标签叠加", () => {
  assert.deepEqual(filterNotes(N, { q: "祷告 罗马" }).map(n => n.id), ["b"]);
  assert.deepEqual(filterNotes(N, { q: "怜悯" }).map(n => n.id), ["a"]);
  assert.deepEqual(filterNotes(N, { tag: "祷告" }).map(n => n.id), ["a", "b"]);
  assert.deepEqual(filterNotes(N, { kind: "spirit", tag: "祷告" }).map(n => n.id), ["b"]);
  assert.deepEqual(filterNotes(N, { q: "不存在" }), []);
  assert.equal(filterNotes(N, {}).length, 3);
});

test("tagCounts: 次数多的在前", () => {
  assert.deepEqual(tagCounts(N), [["祷告", 2], ["信心", 1]]);
});

test("groupNotes: 按月、按类型、按标签（含无标签）", () => {
  assert.deepEqual(groupNotes(N, "month").map(g => [g.title, g.notes.length]), [["2026-10", 2], ["2026-11", 1]]);
  assert.deepEqual(groupNotes(N, "kind", k => k).map(g => g.title), ["reading", "question", "spirit"]);
  const g = groupNotes(N, "tag");
  assert.deepEqual(g.map(x => x.title), ["#祷告", "#信心", ""]);
  assert.equal(g[0].notes.length, 2);
});

test("toMarkdown: 摘录用引用块，AI 识字的加提醒，署名可选", () => {
  const md = toMarkdown(N, { title: "我的灵修", group: "none", kindLabel: k => ({ reading: "读书心得", spirit: "圣灵感动", question: "问题" }[k]), nameOf: n => n.id === "b" ? "妈妈" : "" });
  assert.match(md, /^# 我的灵修/);
  assert.match(md, /> 神的荣耀在于\n> 祂的怜悯/);
  assert.match(md, /请核对原文/);
  assert.match(md, /### 罗马书 8:26\n\*2026-10-05 · 圣灵感动 · #祷告 · 妈妈\*/);
  assert.ok(md.indexOf("荣耀的中心") < md.indexOf("罗马书"), "旧的在前");
  assert.doesNotMatch(md, /\n{3,}/);
});

test("parseOcr: JSON、带代码块的 JSON、纯文本、空", () => {
  assert.deepEqual(parseOcr('{"paragraphs":["甲"," 乙 ",""],"book":"书","page":"3"}'), { paragraphs: ["甲", "乙"], book: "书", page: "3" });
  assert.deepEqual(parseOcr('```json\n{"paragraphs":["甲"]}\n```').paragraphs, ["甲"]);
  assert.deepEqual(parseOcr("第一段\n续行\n\n第二段").paragraphs, ["第一段\n续行", "第二段"]);
  assert.deepEqual(parseOcr("").paragraphs, []);
  assert.deepEqual(parseOcr('{"paragraphs":"oops"}').paragraphs, ['{"paragraphs":"oops"}']);
});

test("joinQuote: 按原顺序合并选中的段落", () => {
  assert.equal(joinQuote(["a", "b", "c"], new Set([2, 0])), "a\n\nc");
});

test("compilePrompt: 带出笔记内容，未知用途回退到请教清单", () => {
  const p = compilePrompt("nope", N);
  assert.match(p.user, /请教/);
  assert.match(p.user, /摘录：神的荣耀在于/);
  assert.match(p.user, /心得：圣灵为我们祷告/);
});

test("monthsOf: 有笔记的月份，新的在前，带条数", () => {
  assert.deepEqual(monthsOf(N), [["2026-11", 1], ["2026-10", 2]]);
  assert.deepEqual(monthsOf([]), []);
});

test("onThisDay: 往年同月同日，不含今年", () => {
  const L = [{ id: "1", day: "2025-10-24", created_at: "a" }, { id: "2", day: "2024-10-24", created_at: "b" }, { id: "3", day: "2026-10-24", created_at: "c" }, { id: "4", day: "2025-10-25", created_at: "d" }];
  assert.deepEqual(onThisDay(L, "2026-10-24").map(n => n.id), ["1", "2"]);
  assert.deepEqual(onThisDay(L, "2026-01-01"), []);
});

test("searchWords: 小写、按空白切、去重、最多 8 个", () => {
  assert.deepEqual(searchWords("  Grace  罗马 grace "), ["grace", "罗马"]);
  assert.deepEqual(searchWords(""), []);
  assert.equal(searchWords(Array.from({ length: 12 }, (_, i) => "w" + i).join(" ")).length, 8);
});

test("noteArgs: 筛选状态 → RPC 参数（范围、类型、标签、月份）", () => {
  const ui = { q: "", kind: "all", tag: "all", scope: "mine", month: null };
  assert.deepEqual(noteArgs(ui), { p_scope: "mine", p_family: null, p_words: [], p_kind: null, p_tag: null, p_month: "latest" });
  assert.equal(noteArgs({ ...ui, month: "2026-10" }).p_month, "2026-10");
  assert.equal(noteArgs({ ...ui, month: "all" }).p_month, null);
  // 有筛选：跨全部月份
  const f = noteArgs({ ...ui, month: "2026-10", q: "信心 Hope", kind: "spirit", tag: "祷告" });
  assert.deepEqual(f, { p_scope: "mine", p_family: null, p_words: ["信心", "hope"], p_kind: "spirit", p_tag: "祷告", p_month: null });
  // 分享给我的：要有家庭；没加入家庭时退回“我的”
  assert.deepEqual([noteArgs({ ...ui, scope: "shared" }, { family: "F" }).p_scope, noteArgs({ ...ui, scope: "shared" }, { family: "F" }).p_family], ["shared", "F"]);
  assert.equal(noteArgs({ ...ui, scope: "shared" }).p_scope, "mine");
  assert.equal(filtersOn(ui), false);
  assert.equal(filtersOn({ ...ui, q: "  " }), false);
  assert.equal(filtersOn({ ...ui, tag: "x" }), true);
});

test("statsArgs: 去掉月份，带上今天", () => {
  const a = noteArgs({ q: "x", kind: "all", tag: "all", scope: "mine", month: "2026-10" });
  assert.deepEqual(statsArgs(a, "2026-10-31"), { p_scope: "mine", p_family: null, p_words: ["x"], p_kind: null, p_tag: null, p_day: "2026-10-31" });
});

test("cursorArgs / pageSlice: 键集游标取上一页最后一行；多要的一条只判断有没有下一页", () => {
  assert.deepEqual(cursorArgs(null), { p_after_day: null, p_after_created: null, p_after_user: null, p_after_id: null });
  const r = { user_id: "u1", id: "a", day: "2026-10-01", created_at: "2026-10-01T08:00:00Z" };
  assert.deepEqual(cursorArgs(r), { p_after_day: "2026-10-01", p_after_created: "2026-10-01T08:00:00Z", p_after_user: "u1", p_after_id: "a" });
  assert.deepEqual(pageSlice([1, 2, 3], 2), { rows: [1, 2], hasNext: true });
  assert.deepEqual(pageSlice([1, 2], 2), { rows: [1, 2], hasNext: false });
  assert.deepEqual(pageSlice(null, 2), { rows: [], hasNext: false });
});

test("effMonth: 选过且还有笔记的月份 / 全部 / 否则最新的月", () => {
  const ms = [["2026-11", 1], ["2026-10", 2]];
  assert.equal(effMonth({ month: null }, ms), "2026-11");
  assert.equal(effMonth({ month: "2026-10" }, ms), "2026-10");
  assert.equal(effMonth({ month: "2025-01" }, ms), "2026-11");
  assert.equal(effMonth({ month: "all" }, ms), "all");
  assert.equal(effMonth({ month: null }, []), "all");
  assert.equal(effMonth({ month: null }, monthsOf(N)), "2026-11");
});
