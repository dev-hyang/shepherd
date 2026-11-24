import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm, toast } from "./core/util.js";
import { TEMPLATE } from "./data/kinds.js";
import { agoText, bigDur } from "./hero-dur.js";
import { PRESETS, hasPractice, lastTs, logData, overdue, practiceFor, presetPractice } from "./hero-presets-lib.js";
import * as wb from "./wb.js";

/* ============ 顶部预设卡片：读经祷告 / 锻炼 / 陪伴妻子 / 陪伴孩子 / 休息 ============
   单项的卡（锻炼、陪伴）：大字「距上次」+「记一次」「补记」「历史记录」；多项的卡（读经祷告、休息）：每项一个小格子，点哪个记哪个。
   记录都是标准的打卡记录：能在「回顾 → 记录」里查、改、删、补记。纯逻辑在 hero-presets-lib.js。 */
const settingsNow = () => (S.wb.profile || {}).settings;
const pidFor = (key, it) => { const p = practiceFor(S.wb.practices, key, it); return p ? esc(p.id) : ""; };

function singleCard(key, now){
  const P = PRESETS[key], it = P.items[0], ts = lastTs(S.wb.logs, S.wb.practices, key, it), pid = pidFor(key, it);
  const due = overdue(key, it, ts, now.getTime(), settingsNow());
  const main = key === "exercise" && pid ? `<button class="hbtn txt" data-act="min-add" data-pid="${pid}">${t("记一次")}</button>`
    : `<button class="hbtn txt" data-act="hp-log" data-key="${key}" data-item="${it.k}">${t("记一次")}</button>`;
  return `<section class="hero hpcard${due ? " due" : ""}" aria-label="${esc(t(P.label))}"><div class="moon"></div>
    <div class="lbl">${it.icon} ${t("距上次")} ${esc(t(it.label))}</div>
    <div class="big num">${ts ? bigDur(now.getTime() - ts) : t("还没记录")}</div>
    <div class="meta"><span>${ts ? t("上次 {time}", { time: hm(ts) }) : t("点「记一次」开始记")}</span>${due ? `<span class="side">${t("已超过 {n} 小时，该留意了", { n: due.warn })}</span>` : ""}</div>
    <div class="medact">${main}${pid ? `<button class="hbtn txt" data-act="rec-new" data-pid="${pid}">${t("补记")}</button>` : ""}<button class="hbtn txt" data-act="rec-open" data-pid="${pid}">${t("历史记录")}</button></div></section>`;
}
function gridCard(key, now){
  const P = PRESETS[key];
  const tiles = P.items.map(it => { const ts = lastTs(S.wb.logs, S.wb.practices, key, it), due = overdue(key, it, ts, now.getTime(), settingsNow());
    return `<button class="hptile${due ? " due" : ""}" data-act="hp-log" data-key="${key}" data-item="${it.k}" aria-label="${esc(t("记一次{x}", { x: t(it.label) }))}"><span class="hpi" aria-hidden="true">${it.icon}</span><span class="hpn">${t(it.label)}</span><span class="hpd">${ts ? agoText(now.getTime() - ts) : t("还没记录")}</span></button>`; }).join("");
  const pid = pidFor(key, P.items[0]);
  return `<section class="hero hpcard" aria-label="${esc(t(P.label))}"><div class="moon"></div>
    <div class="lbl">${P.icon} ${t("距上次")} · ${esc(t(P.label))}</div>
    <div class="hpgrid">${tiles}</div>
    <div class="medact">${key === "rest" && pid ? `<button class="hbtn txt" data-act="rec-new" data-pid="${pid}">${t("补记")}</button>` : ""}<button class="hbtn txt" data-act="rec-open" data-pid="${key === "rest" ? pid : ""}">${t("历史记录")}</button></div></section>`;
}
const presetCard = (key, now) => (PRESETS[key].items.length > 1 ? gridCard : singleCard)(key, now);

/** 这个预设背后的习惯没有就建一个（读经祷告 / 锻炼用起步模板，陪伴 / 休息是带 preset 标记的自定义习惯） */
async function ensurePreset(key){
  const P = PRESETS[key];
  if (P.kinds) { for (const k of P.kinds) if (!practiceFor(S.wb.practices, key, { k })) await wb.upsertPractice({ ...TEMPLATE.find(x => x.kind === k), share: "private" }); }
  else if (!hasPractice(S.wb.practices, key)) await wb.upsertPractice(presetPractice(key));
}
/** 点格子 / 「记一次」：记一条（现在） */
async function hpAct(act, d){
  if (act !== "hp-log") return;
  const P = PRESETS[d.key], it = P && P.items.find(x => x.k === d.item); if (!it) return;
  await ensurePreset(d.key);
  const p = practiceFor(S.wb.practices, d.key, it); if (!p) return;
  await wb.addLog(p.kind, p.id, logData(d.key, it));
  toast(t("已记录：{x}", { x: t(it.label) }));
}
export { presetCard, ensurePreset, hpAct };
