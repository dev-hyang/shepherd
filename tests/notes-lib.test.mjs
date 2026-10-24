// node --test tests/notes-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseTags, filterNotes, groupNotes, toMarkdown, parseOcr, joinQuote, tagCounts, compilePrompt } from "../js/notes-lib.js";

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
