import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { chipBtn, secHead } from "./ui.js";
import * as wb from "./wb.js";

/* 读经：计划里今天这一段。读完打勾进一格；也可以记一段计划外的 */
function readingHTML(){
  const tp = wb.todayPassage(), rl = wb.readingLog(), extra = wb.logsOfKind("scripture", wb.viewDay()).filter(l => l !== rl);
  const s = wb.settings(), zh = s.versionZh || "和合本", en = s.versionEn == null ? "BSB" : s.versionEn;
  let body;
  if (!tp) body = `<p class="muted">${t("还没选读经计划。选一个，每天这里就会列出当天的段落。")}</p><div class="ui-acts btns" style="margin-top:0"><button class="ui-btn" data-tone="primary" data-act="plan">${t("选读经计划")}</button><button class="ui-btn" data-tone="ghost" data-act="read-other">${t("记一段读过的")}</button></div>`;
  else {
    const it = tp.item;
    // 读完后：大字显示今天读了哪段，小字预告明天；没读完：大字是今天这段
    const headline = rl ? `<b style="font-size:18px">${esc(rl.data.ref || it.label)} ✓</b><div class="small muted">${t("明天：{label}", { label: esc(it.label) })}</div>` : `<b style="font-size:18px">${esc(it.label)}</b>${it.note ? `<div class="small">${esc(it.note)}</div>` : ""}`;
    body = `<div class="row"><div class="v">${headline}<div class="small muted">${tc(esc(tp.plan.name))} · ${t("第 {i} / {n} 段", { i: tp.index + 1, n: tp.total })}${tp.round ? ` · ${t("第 {r} 轮", { r: tp.round + 1 })}` : ""}</div></div></div>
    ${!rl && it.parts && it.parts.length ? `<div class="ui-acts btns" style="margin-top:10px"><button class="chip" data-act="read-text" aria-pressed="${S.showText}">${S.showText ? t("收起经文") : t("显示经文")}</button>${S.showText ? `<span class="small muted" style="align-self:center">${esc(zh)}${en ? " · " + esc(en) : ""} <button class="chip" data-act="plan">${t("换译本")}</button></span>` : ""}</div>
    ${S.showText ? `<div id="passage" class="passage"><p class="muted small">${t("正在抓取经文…")}</p></div>` : ""}` : ""}
    <div class="ui-acts btns">${rl ? `<button class="ui-btn" data-tone="ghost" data-act="read-undo">${t("今天读完了 ✓ · 点击撤销")}</button>` : `<button class="ui-btn" data-tone="primary" data-act="read-done">${t("读完了")}</button>`}<button class="ui-btn" data-tone="ghost" data-act="read-other">${t("另记一段")}</button></div>`;
  }
  const extraRows = extra.map(l => `<div class="small muted" style="margin-top:6px" data-swipe-del="extra-read">${t("另读了")} <b>${esc(l.data.ref || "")}</b>${l.data.note ? ` · ${esc(l.data.note)}` : ""} <button class="chip swipe-src" data-act="log-del" data-lid="${esc(l.id)}">${t("删")}</button></div>`).join("");
  if (S.showText && tp && tp.item.parts && tp.item.parts.length) loadPassage(tp.item, zh, en);
  return `${secHead(t("读经"), chipBtn(t("计划"), 'data-act="plan"'))}<div class="panel ${rl ? "done" : ""}">${body}${extraRows}</div>`;
}
async function loadPassage(item, zh, en){
  // 渲染时被调用，这时 #passage 还没插进页面：等一拍再找容器
  await new Promise(r => setTimeout(r, 0));
  const box = () => document.querySelector("#passage"); if (!box()) return;
  const zhText = await wb.passageText(item, zh);
  if (!box()) return;
  const chap = (c, enC) => `<h3 style="margin-top:12px">${esc(c.title)}</h3>${c.error ? `<p class="small muted">${t("没取到：")}${esc(c.error)}</p>` : c.verses.map((v, i) => `<p class="verse"><sup>${v.v}</sup>${esc(v.text)}${enC && enC.verses && enC.verses[i] ? `<span class="en">${esc(enC.verses[i].text)}</span>` : ""}</p>`).join("")}`;
  box().innerHTML = zhText.map(c => chap(c, null)).join("");
  if (en) { const enText = await wb.passageText(item, en); if (box()) box().innerHTML = zhText.map((c, i) => chap(c, enText[i])).join(""); }
}


/** 读经页：今天这一段 + 连续天数 / 本周 / 计划进度 + 最近 7 天 */
function readingView(){
  const sp = wb.firstOfKind("scripture"), tp = wb.todayPassage(), day = S.day;
  const days = [...Array(7)].map((_, i) => wb.dayAdd(day, -(6 - i))), read = d => !!(wb.readingLog(d) || wb.logsOfKind("scripture", d)[0]);
  const week = days.filter(read).length, streak = sp ? wb.streak(sp) : 0, pct = tp ? Math.round(tp.index / tp.total * 100) : 0;
  const stats = `<div class="stats compact" style="margin-top:12px"><div class="stat"><div class="v">${streak}<small>${t("天")}</small></div><div class="k">${t("连续")}</div></div>
    <div class="stat"><div class="v">${week}<small>/7</small></div><div class="k">${t("近 7 天读了")}</div></div>${tp ? `<div class="stat"><div class="v">${pct}<small>%</small></div><div class="k">${t("计划进度")}</div></div>` : ""}</div>`;
  const strip = `<div class="daystrip" role="img" aria-label="${esc(t("近 7 天读经"))}">${days.map(d => `<span class="${read(d) ? "on" : ""}"><i></i><small>${d.slice(8)}</small></span>`).join("")}</div>`;
  return `<div style="margin-top:12px">${readingHTML()}</div>${stats}${strip}`;
}

export { readingHTML, readingView };
