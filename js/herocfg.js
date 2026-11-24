import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, toast } from "./core/util.js";
import { kindOf } from "./data/kinds.js";
import { PRESETS, alertOff, allCards, hasPractice, keyOf, practiceFor } from "./hero-presets-lib.js";
import { ensurePreset } from "./hero-presets.js";
import { hoursOf, howText, moveId } from "./med-hero-lib.js";
import * as wb from "./wb.js";

/* ============ 今天 → 顶部卡片：管什么卡片出现、什么顺序 ============
   问候卡永远是第一张。其余卡片：每种用药 / 保健品一张，加上预设（读经祷告、锻炼、陪伴妻子、陪伴孩子、休息）。
   每张卡能开 / 关（康复了关掉就不再出现，随时能重新打开；没有对应习惯的预设，打开时自动建一个）、上下挪；
   顺序记在个人设置 heroOrder（id 列表），预设的开关记在 heroPresets。 */
const settingsNow = () => (S.wb.profile || {}).settings || {};
const cardsNow = () => allCards(S.wb.practices, settingsNow());

function medRow(c, i, n){
  const p = c.p, k = kindOf(p), sub = [((p.schedule || {}).times || []).join("、"), hoursOf(p) ? t("至少隔 {n} 小时", { n: hoursOf(p) }) : "", (p.meta || {}).dose, howText(p.meta, t)].filter(Boolean).join(" · ");
  return rowHTML({ id: c.id, on: c.on, i, n, icon: k.icon, color: k.color, name: p.name || t(k.label), sub: sub || t("没有设时间点"), edit: p.id });
}
function presetRow(c, i, n){
  const P = PRESETS[c.key], pid = (practiceFor(S.wb.practices, c.key, P.items[0]) || {}).id;
  return rowHTML({ id: c.id, on: c.on, i, n, icon: P.icon, color: "#6B7F5C", name: t(P.label), sub: t(P.desc), edit: pid, add: !c.on && !hasPractice(S.wb.practices, c.key), alert: P.items.some(x => x.warn) ? { id: c.id, on: !alertOff(c.key, settingsNow()) } : null });
}
function rowHTML({ id, on, i, n, icon, color, name, sub, edit, add, alert }){
  const mv = (dir, label, ch, off) => `<button class="iconbtn" data-act="hc-move" data-id="${esc(id)}" data-dir="${dir}" aria-label="${esc(t(label))} ${esc(name)}" ${off ? "disabled" : ""}>${ch}</button>`;
  return `<div class="hcrow ${on ? "" : "off"}"><span class="hi" style="background:${color}22;color:${color}" aria-hidden="true">${icon}</span>
    <div class="hc-main"><b>${esc(name)}</b><small class="muted">${esc(sub)}</small></div>
    <span class="hc-acts"><button class="chip" data-act="hc-toggle" data-id="${esc(id)}" aria-pressed="${on}">${on ? t("显示中") : add ? t("添加") : t("已隐藏")}</button>
      ${alert ? `<button class="chip" data-act="hc-alert" data-id="${esc(alert.id)}" aria-pressed="${alert.on}" title="${esc(t("很久没记就把卡片变成暖色提醒"))}">${t("提醒")}${alert.on ? " ✓" : ""}</button>` : ""}${mv(-1, "上移", "↑", i === 0)}${mv(1, "下移", "↓", i === n - 1)}${edit ? `<button class="chip" data-act="habit-edit" data-pid="${esc(edit)}">${t("编辑")}</button>` : ""}</span></div>`;
}
function viewHeroCfg(){
  const list = cardsNow();
  return `<p class="small muted">${t("今天页顶上可以左右滑的卡片。第一张是问候卡，固定在最前；下面这些卡片可以隐藏（比如病好了不用再吃药）、调整先后。")}</p>
  <div class="panel hclist"><div class="hcrow fixed"><span class="hi" aria-hidden="true">☀</span><div class="hc-main"><b>${t("问候卡")}</b><small class="muted">${t("日期、问候，补记前几天也在这里切换")}</small></div><span class="hc-acts"><span class="ui-badge">${t("固定")}</span></span></div>
    ${list.map((c, i) => (c.type === "med" ? medRow : presetRow)(c, i, list.length)).join("")}</div>
  <div class="btns"><button class="btn primary" data-act="habit-add-kind" data-kind="med">＋ ${t("添加用药")}</button><button class="btn" data-act="habit-add-kind" data-kind="supplement">＋ ${t("添加保健品")}</button></div>
  <p class="small muted" style="margin-top:10px">${t("陪伴、休息和读经祷告、锻炼的记录都在「回顾 → 记录」里查、改、删、补记。")}</p>`;
}
async function heroCfgAct(act, d){
  const c = cardsNow().find(x => x.id === d.id);
  if (act === "hc-toggle" && c) {
    if (c.type === "med") { await wb.upsertPractice({ ...c.p, meta: { ...(c.p.meta || {}), hero: !c.on } }); toast(c.on ? t("已隐藏") : t("已显示")); return; }
    const key = keyOf(c.id);
    if (!c.on) await ensurePreset(key);   // 打开前先确保有对应习惯
    await wb.saveSettings({ heroPresets: { ...(settingsNow().heroPresets || {}), [key]: !c.on } });
    toast(c.on ? t("已隐藏") : t("已显示"));
  }
  if (act === "hc-alert" && c && c.type === "preset") { const key = keyOf(c.id), off = settingsNow().heroAlertOff || []; await wb.saveSettings({ heroAlertOff: off.includes(key) ? off.filter(k => k !== key) : [...off, key] }); }
  if (act === "hc-move" && c) await wb.saveSettings({ heroOrder: moveId(cardsNow().map(x => x.id), c.id, +d.dir) });
}
export { viewHeroCfg, heroCfgAct };
