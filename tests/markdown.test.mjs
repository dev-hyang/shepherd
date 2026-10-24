// node --test tests/markdown.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mdToHtml, mdToText } from "../js/markdown.js";

test("块：标题、列表、引用、分隔线、段落内换行", () => {
  assert.equal(mdToHtml("# 大\n## 中\n#### 小"), '<h4 class="md-h">大</h4><h5 class="md-h">中</h5><h6 class="md-h">小</h6>');
  assert.equal(mdToHtml("- 甲\n* 乙\n+ 丙"), "<ul><li>甲</li><li>乙</li><li>丙</li></ul>");
  assert.equal(mdToHtml("1. 一\n2) 二"), "<ol><li>一</li><li>二</li></ol>");
  assert.equal(mdToHtml("> 引\n> 用"), "<blockquote>引<br>用</blockquote>");
  assert.equal(mdToHtml("上\n\n---\n\n下"), "<p>上</p><hr><p>下</p>");
  assert.equal(mdToHtml("第一行\n第二行\n\n新段"), "<p>第一行<br>第二行</p><p>新段</p>");
});

test("行内：粗体、斜体、代码、链接", () => {
  assert.equal(mdToHtml("a **b** *c* _d_ `e`"), "<p>a <strong>b</strong> <em>c</em> <em>d</em> <code>e</code></p>");
  assert.equal(mdToHtml("[主页](https://x.test/a?b=1&c=2)"), '<p><a href="https://x.test/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">主页</a></p>');
  assert.equal(mdToHtml("`**不加粗**`"), "<p><code>**不加粗**</code></p>");
  assert.equal(mdToHtml("snake_case_name 2*3*4"), "<p>snake_case_name 2*3*4</p>", "单词里的下划线和乘号不当斜体");
});

test("安全：原始 HTML、危险链接、属性注入都不会生效", () => {
  const bad = mdToHtml('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](https://a.test/"onmouseover="alert(1)) **<b>**');
  assert.doesNotMatch(bad, /<script|<img|<b>/);
  assert.doesNotMatch(bad, /href="javascript/i);
  assert.doesNotMatch(bad, /"onmouseover=/, "引号被转义，出不了属性");
  assert.match(bad, /&lt;script&gt;/);
  assert.equal(mdToHtml("> <script>x</script>"), "<blockquote>&lt;script&gt;x&lt;/script&gt;</blockquote>");
  assert.equal(mdToHtml("# <i>t</i>"), '<h4 class="md-h">&lt;i&gt;t&lt;/i&gt;</h4>');
});

test("空值、CRLF、没有 Markdown 的纯文字保持原样", () => {
  assert.equal(mdToHtml(""), ""); assert.equal(mdToHtml(null), "");
  assert.equal(mdToHtml("甲\r\n乙"), "<p>甲<br>乙</p>");
  assert.equal(mdToHtml("今天特别需要提醒"), "<p>今天特别需要提醒</p>");
});

test("mdToText：去标记留内容", () => {
  assert.equal(mdToText("# 标题\n- **粗**体 [链](https://a.test)\n> 引用 `码`"), "标题\n粗体 链\n引用 码");
  assert.equal(mdToText("普通文字"), "普通文字");
});
