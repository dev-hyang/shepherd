import { locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc, toast } from "./core/util.js";
import { PRAYER_CATS, kindOf, modeOf } from "./data/kinds.js";
import { aiReady, aiSettings, askText, providerOf } from "./ai.js";
import { mdToHtml } from "./markdown.js";
import { openAiSettings } from "./notes.js";
import { summarize } from "./review.js";
import { chipBtn, pageHead } from "./ui.js";
import { render } from "./views.js";
import * as tk from "./tk.js";
import * as wb from "./wb.js";

/* ============ 小Y问 · AI 问询页（我的 → 小Y问；今天页也有入口）============
   和爱家小助手的「小Y问」同一套思路：有 key（设置 → AI 助手，复用 js/ai.js）直接出答案；没 key 就把问题连同记录摘要拼成提示词，
   一键复制到任一 AI 粘贴。场景按成年人的身心灵记录来：本周灵修、身体作息、时间专注、祷告、读经计划、情绪压力、带领家人。
   发出去的记录摘要只有统计数字和计划进度：几天读经、连续几天、锻炼多少分钟、逾期几件、代祷几项……
   绝不包含祷告内容、笔记正文、任务标题、家人姓名。摘要在发送前可以展开看一眼。 */
const TOPICS = [
  { id: "spirit", icon: "📖", name: "本周灵修回顾", q: "看看我最近 7 天的读经和祷告情况，先说说做得好的地方，再给我下周可以怎么更稳定地坚持的一两个小建议。", secs: ["scripture", "plan", "prayer"] },
  { id: "body",   icon: "🏃", name: "身体与作息",   q: "根据我最近 7 天的锻炼、饮食、睡眠和屏幕时长，哪一项最值得先调整？给我一个下周就能做到的小目标。", secs: ["habits"] },
  { id: "focus",  icon: "🍅", name: "时间与专注",   q: "下面是我的任务和专注计时情况。帮我看看明天怎么安排：哪些该先做，哪些可以放下或顺延？", secs: ["focus", "tasks"] },
  { id: "prayer", icon: "🕊", name: "祷告生活",     q: "下面是我代祷清单的情况（只有数量）。怎样把祷告安排得更有节奏，不让清单越积越多、也不流于形式？", secs: ["prayer"] },
  { id: "plan",   icon: "📅", name: "读经计划",     q: "下面是我读经计划的进度。落后了怎么追上？还是该换一个更合适的计划？", secs: ["plan", "scripture"] },
  { id: "mood",   icon: "🌤", name: "情绪与压力",   q: "从我最近的饮食评分、睡眠和屏幕时长看，我是不是压力有点大？给我两三个今晚就能做的放松和安静的方法。", secs: ["habits", "focus"] },
  { id: "family", icon: "👪", name: "带领家人",     q: "我想在家里做属灵的带领。结合我自己最近的读经祷告情况，怎样带动家人一起有规律地敬拜和祷告，又不显得生硬？", secs: ["scripture", "prayer", "family"] }
];
// 可直接打开的 AI 网页（手机上是通用链接，装了 App 会拉起 App）
const AI_SITES = [["ChatGPT", "https://chatgpt.com/"], ["DeepSeek", "https://chat.deepseek.com/"], ["Claude", "https://claude.ai/new"],
  ["豆包", "https://www.doubao.com/chat/"], ["通义千问", "https://www.tongyi.com/"], ["Kimi", "https://www.kimi.com/"], ["Gemini", "https://gemini.google.com/app"]];
const LANG_NAME = { en: "English", "zh-TW": "繁體中文" };

const st = () => (S.ask ||= { q: "", topic: null, withCtx: true, busy: false, answer: null, error: null });
const topicOf = id => TOPICS.find(x => x.id === id) || null;

/* ---- 记录摘要：只有数字 ---- */
const DAYS = 7;
const last7 = () => [...Array(DAYS)].map((_, i) => wb.dayAdd(S.day, -i));
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
function secScripture(days){
  const sp = wb.firstOfKind("scripture"); if (!sp) return [];
  const sched = days.filter(d => wb.scheduledOn(sp, d)), done = sched.filter(d => wb.statusOf(sp, d).done).length;
  return [t("读经：最近 {n} 天里读了 {a}/{b} 天，连续 {s} 天", { n: DAYS, a: done, b: sched.length, s: wb.streak(sp) })];
}
function secPlan(){
  const tp = wb.todayPassage(); if (!tp) return [t("读经计划：还没选")];
  const rl = wb.readingLog(S.day);
  return [t("读经计划「{name}」：第 {i} / {n} 段（{p}%），今天{done}", { name: tp.plan.name, i: tp.index + 1, n: tp.total, p: pct(tp.index, tp.total), done: rl ? t("已读") : t("未读") })];
}
function secPrayer(days){
  const pp = wb.firstOfKind("prayer");
  const prayedDays = days.filter(d => (pp ? wb.logsFor(pp.id, d) : wb.logsOfKind("prayer", d)).length).length;
  const all = S.wb.prayers || [], open = all.filter(p => p.status !== "answered"), answered = all.length - open.length;
  const cats = Object.keys(PRAYER_CATS).map(k => [k, open.filter(p => p.category === k).length]).filter(([, n]) => n);
  const cut = wb.dayAdd(S.day, -14), stale = open.filter(p => !p.last_prayed || p.last_prayed < cut).length;
  const out = [t("祷告：最近 {n} 天里有 {a} 天记了祷告", { n: DAYS, a: prayedDays })];
  if (all.length) out.push(t("代祷清单：代祷中 {o} 项（{cats}），已应允 {d} 项，其中 {s} 项两周以上没有为它祷告", { o: open.length, cats: cats.map(([k, n]) => `${t(PRAYER_CATS[k])} ${n}`).join("、") || "–", d: answered, s: stale }));
  return out;
}
// 锻炼、饮食、睡眠、屏幕、用药、自定义：复用回顾页的汇总
function secHabits(days){
  const asc = [...days].reverse(), out = [];
  for (const p of wb.activePractices().filter(p => !["scripture", "prayer", "focus"].includes(p.kind))) {
    const k = kindOf(p), s = summarize(p, asc), tg = p.target || {}, name = t(k.label), mode = modeOf(p);
    let goal = "";
    if (tg.per === "week" && tg.count) goal = t("目标每周 {n} 次{m}", { n: tg.count, m: tg.minutes ? ` × ${tg.minutes} ${t("分钟")}` : "" });
    else if (tg.max != null) goal = t("目标 ≤ {m}", { m: tg.max }); else if (tg.min != null) goal = t("目标 ≥ {m}", { m: tg.min });
    const main = s.main == null ? "–" : `${s.main}${s.unit ? ` ${t(s.unit)}` : ""}`;
    out.push(`${name}${p.kind === "custom" && p.name ? `（${t("自定义")}）` : ""}：${mode === "value" ? t("平均 ") : ""}${main}${s.sub ? `，${s.sub}` : ""}${goal ? `；${goal}` : ""}`);
  }
  return out.length ? [t("最近 {n} 天的习惯：", { n: DAYS })].concat(out.map(x => "- " + x)) : [];
}
function secFocus(days){
  const fp = wb.firstOfKind("focus"), out = [];
  if (fp) { const s = summarize(fp, [...days].reverse()); out.push(t("专注计时：最近 {n} 天 {a} 段，共 {m} 分钟{goal}", { n: DAYS, a: s.sessions || 0, m: s.minutes || 0, goal: fp.target && fp.target.count ? `（${t("目标每天 {c} 段", { c: fp.target.count })}）` : "" })); }
  return out;
}
function secTasks(){
  if (!(S.tk && S.tk.loaded && !S.tk.error)) return [];
  const od = tk.overdue(), today = tk.onDay(S.day).filter(x => !x.virtual), from = wb.dayAdd(S.day, -(DAYS - 1));
  const doneWeek = tk.doneLogs().filter(l => l.day >= from).length, m = tk.mit(), mitDone = m.filter(x => x.status !== "open").length;
  const oldest = od.length ? tk.overdueDays(od[0]) : 0;
  return [t("任务：逾期 {o} 件{old}，今天还有 {d} 件未完成，收件箱 {i} 件，最近 {n} 天完成 {w} 件{mit}", { o: od.length, old: oldest ? `（${t("最久 {d} 天", { d: oldest })}）` : "", d: today.length, i: tk.inbox().length, n: DAYS, w: doneWeek, mit: m.length ? `；${t("今日三件大事完成 {a}/{b}", { a: mitDone, b: m.length })}` : "" })];
}
function secFamily(){
  if (!S.family) return [t("家庭：还没加入家庭")];
  const n = Object.keys(S.members || {}).length || 1, fam = wb.familyToday(S.day), items = fam.reduce((s, m) => s + m.items.length, 0), done = fam.reduce((s, m) => s + m.items.filter(x => x.st.done).length, 0);
  return [t("家庭：{n} 位成员；家人开给我看的习惯今天 {d}/{a} 项已完成", { n, d: done, a: items })];
}
const SECS = { scripture: () => secScripture(last7()), plan: secPlan, prayer: () => secPrayer(last7()), habits: () => secHabits(last7()), focus: () => secFocus(last7()), tasks: secTasks, family: secFamily };
const ALL_SECS = ["scripture", "plan", "prayer", "habits", "focus", "tasks", "family"];
/** 摘要文本；没登录或没数据时为空串 */
function contextText(topic){
  if (!(S.cloud === "ready" && S.wb.loaded)) return "";
  const secs = topic ? topicOf(topic).secs : ALL_SECS;
  return secs.flatMap(k => { try { return SECS[k](); } catch (e) { return []; } }).join("\n");
}

/* ---- 提示词 ---- */
const systemPrompt = () => `你是「小Y」：一位温和、不说教的属灵同伴，也是懂健康生活的顾问，在「牧羊人」这个个人身心灵记录应用里陪伴一位成年基督徒。
依据对方的记录摘要（只有统计数字和进度，没有私密内容）给出具体、可行的小步建议；先肯定已经做到的，再说可以调整的，不责备。
可以引用一两句圣经，但不要堆砌经文；不做医疗诊断、不给药物剂量，身体明显不适请建议就医。
用${LANG_NAME[locale()] || "简体中文"}回答，250 字以内（英文 180 词），分 2–4 个短段落。`;
function userPrompt(a){
  const ctx = a.withCtx ? contextText(a.topic) : "";
  return `${ctx ? `我最近的记录摘要：\n${ctx}\n\n` : ""}问题：${a.q}`;
}
const promptText = a => `${systemPrompt()}\n\n${userPrompt(a)}`;

/* ---- 页面 ---- */
function viewAsk(){
  const a = st(), ready = aiReady(), p = providerOf(aiSettings().provider), ctx = a.withCtx ? contextText(a.topic) : "";
  const topics = TOPICS.map(x => `<button type="button" class="chip" data-act="ask-topic" data-topic="${x.id}" aria-pressed="${a.topic === x.id}">${x.icon} ${t(x.name)}</button>`).join("");
  const sites = AI_SITES.map(([n, u]) => `<a class="btn sm" href="${u}" target="_blank" rel="noopener noreferrer">${t(n)}</a>`).join("");
  return `${pageHead(`🤖 ${t("小Y问")}`, chipBtn(ready ? t("换模型") : t("填 API key"), 'data-act="ask-settings"'))}
  <p class="small muted" style="margin:0 0 4px">${ready
    ? t("直接问，回答来自你自己填的 {p}。可以附带最近 7 天的记录摘要（只有数字和进度）。", { p: t(p.name) })
    : t("还没填 API key：把问题连同记录摘要拼成提示词，复制到任一 AI 粘贴即可；填了 key（免费的 Gemini 就行）就能在这里直接出答案。")}</p>
  <div class="chips" style="margin:8px 0">${topics}</div>
  <form id="askForm" class="panel ask-form">
    <textarea name="q" rows="3" maxlength="1000" aria-label="${esc(t("要问的问题"))}" placeholder="${esc(t("例如：最近读经总是读不进去，怎么办？"))}">${esc(a.q)}</textarea>
    <label class="ask-ctx"><input type="checkbox" name="ctx" ${a.withCtx ? "checked" : ""}><span>${t("附带我最近 7 天的记录摘要（只有统计数字和计划进度；不含祷告内容、笔记正文、任务标题和家人姓名）")}</span></label>
    ${a.withCtx ? `<details class="ask-ctxv"><summary class="small muted">${ctx ? t("看看会发出去什么") : t("摘要为空（登录并记几天后才有）")}</summary>${ctx ? `<pre>${esc(ctx)}</pre>` : ""}</details>` : ""}
    <div class="btns">${ready ? `<button type="submit" class="btn primary" ${a.busy ? "disabled" : ""}>${a.busy ? t("思考中…") : t("发送")}</button>` : ""}<button type="button" class="btn ${ready ? "" : "primary"}" data-act="ask-copy">${t("复制提示词")}</button></div>
    ${a.error ? `<p class="small" style="color:var(--rose);margin:8px 0 0" role="alert">${esc(a.error)}</p>` : ""}
  </form>
  ${!ready ? `<div class="panel" style="margin-top:10px"><p class="small muted" style="margin:0 0 8px">${t("复制后打开任一 AI 粘贴（手机上会直接打开已安装的 App）：")}</p><div class="btns" style="margin-top:0">${sites}</div></div>` : ""}
  ${a.answer ? `<div class="panel ask-answer" style="margin-top:10px"><div class="sec-head" style="margin:0 0 6px"><h2 style="margin:0">${t("小Y的回答")}</h2><span class="sec-acts">${chipBtn(t("复制"), 'data-act="ask-copy-answer"')}</span></div>
    <div class="md">${mdToHtml(a.answer)}</div>
    <p class="small muted" style="margin:10px 0 0">${t("AI 回答仅供参考；身体不适请就医，属灵问题多与牧者和家人交通。")}</p></div>` : ""}`;
}
/** 今天页 / 我的 列表里的入口行 */
function askEntryHTML(){
  return `<div class="panel mlist ask-entry"><button class="mrow" data-tab="ask"><span class="mi" aria-hidden="true">🤖</span><span class="mt"><b>${t("小Y问")}</b><small>${t("问本周灵修、身体作息、时间专注、祷告与读经…")}</small></span><span class="mch" aria-hidden="true">›</span></button></div>`;
}

/* ---- 动作 ---- */
function readAskForm(){
  const a = st(), f = $("#askForm"); if (!f) return a;
  a.q = f.elements.q.value.trim(); a.withCtx = !!f.elements.ctx.checked; return a;
}
async function copy(text, ok){ try { await navigator.clipboard.writeText(text); toast(ok); } catch (e) { window.prompt(t("复制下面的文字"), text); } }
async function askAct(act, el){
  const a = readAskForm();
  switch (act) {
    case "ask-topic": { const id = el.dataset.topic; a.topic = a.topic === id ? null : id; if (a.topic) a.q = t(topicOf(a.topic).q); render(); break; }
    case "ask-settings": openAiSettings(() => render()); break;
    case "ask-copy": if (!a.q) { toast(t("先写一句要问的")); break; } await copy(promptText(a), t("提示词已复制，打开任一 AI 粘贴即可")); break;
    case "ask-copy-answer": if (a.answer) await copy(a.answer, t("已复制")); break;
    case "ask-send": {
      if (!a.q) { a.error = t("先写一句要问的"); render(); break; }
      a.busy = true; a.error = null; render();
      try { a.answer = await askText(systemPrompt(), userPrompt(a), { maxTokens: 1800, temperature: 0.5 }); }
      catch (e) { a.error = String(e.message || e); }
      a.busy = false; render();
      const box = document.querySelector(".ask-answer"); if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
      break; }
    default: return false;
  }
  return true;
}

export { TOPICS, viewAsk, askEntryHTML, askAct, contextText };
