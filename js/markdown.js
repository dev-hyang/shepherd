/* ============ Markdown（轻量，只用于笔记的“心得”）============
   不引库、不支持原始 HTML：所有输入先整体转义，再按下面这几条规则加标签，所以用户（包括家人分享来的笔记）写什么都不会变成脚本或标签。
   支持：# ## ### 标题、- * + 无序列表、1. 有序列表、> 引用、--- 分隔线、**粗体**、*斜体* / _斜体_、`行内代码`、[文字](http(s)://…) 链接；
   单个换行保留为换行。不支持嵌套列表、表格、图片、代码块（笔记不保存图片）。 */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 行内：输入已转义。链接只认 http / https；链接文字里不再解析别的，避免嵌套出怪结构 */
function inline(s){
  const links = [];
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => { links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`); return `\u0000${links.length - 1}\u0000`; });
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0001${codes.length - 1}\u0001`; });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[+i]).replace(/\u0000(\d+)\u0000/g, (_, i) => links[+i]);
}

/** Markdown → 安全的 HTML 片段 */
function mdToHtml(src){
  const lines = esc(String(src ?? "").replace(/\r\n?/g, "\n")).split("\n");
  const out = []; let i = 0;
  const flushPara = para => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); };
  let para = [];
  while (i < lines.length) {
    const line = lines[i], tr = line.trim();
    let m;
    if (!tr) { flushPara(para); para = []; i++; continue; }
    if ((m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(tr))) { flushPara(para); para = []; const lv = Math.min(3, m[1].length); out.push(`<h${lv + 3} class="md-h">${inline(m[2])}</h${lv + 3}>`); i++; continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(tr)) { flushPara(para); para = []; out.push("<hr>"); i++; continue; }
    if (/^&gt;\s?/.test(tr)) { flushPara(para); para = []; const q = []; while (i < lines.length && /^&gt;\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^&gt;\s?/, "")); i++; } out.push(`<blockquote>${q.map(inline).join("<br>")}</blockquote>`); continue; }
    if (/^[-*+]\s+/.test(tr)) { flushPara(para); para = []; const li = []; while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) { li.push(lines[i].trim().replace(/^[-*+]\s+/, "")); i++; } out.push(`<ul>${li.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); continue; }
    if (/^\d+[.)]\s+/.test(tr)) { flushPara(para); para = []; const li = []; while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) { li.push(lines[i].trim().replace(/^\d+[.)]\s+/, "")); i++; } out.push(`<ol>${li.map(x => `<li>${inline(x)}</li>`).join("")}</ol>`); continue; }
    para.push(tr); i++;
  }
  flushPara(para);
  return out.join("");
}

/** Markdown → 纯文字（列表摘要、搜索结果摘要用）：去掉标记，保留内容 */
function mdToText(src){
  return String(src ?? "").replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>\s?/gm, "").replace(/^\s*([-*+]|\d+[.)])\s+/gm, "").replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g, "$1").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[^*\w])[*_]([^*_\n]+)[*_]/g, "$1$2").replace(/`([^`\n]+)`/g, "$1")
    .replace(/\n{2,}/g, "\n").trim();
}

export { mdToHtml, mdToText };
