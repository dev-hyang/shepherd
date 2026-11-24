import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, toast } from "./core/util.js";
import { kindOf } from "./data/kinds.js";
import { heroOn, howText, medCandidates, moveId, orderBy } from "./med-hero-lib.js";
import * as wb from "./wb.js";

/* ============ 今天 → 顶部卡片：管什么卡片出现、什么顺序 ============
   问候卡永远是第一张。其余的卡片：现在是每种用药 / 保健品一张（以后还有读经祷告、锻炼、陪伴、休息等）。
   每张卡能开 / 关（康复了关掉就不再出现，随时能重新打开）、上下挪；顺序记在个人设置 heroOrder（id 列表）。 */
const orderNow = () => ((S.wb.profile || {}).settings || {}).heroOrder || [];
const listNow = () => orderBy(medCandidates(S.wb.practices), orderNow());

function row(p, i, n){
  const k = kindOf(p), on = heroOn(p), times = ((p.schedule || {}).times || []).join("、"), sub = [times, (p.meta || {}).dose, howText(p.meta, t)].filter(Boolean).join(" · ");
  const mv = (dir, label, ch, off) => `<button class="iconbtn" data-act="hc-move" data-pid="${esc(p.id)}" data-dir="${dir}" aria-label="${esc(t(label))} ${esc(p.name || t(k.label))}" ${off ? "disabled" : ""}>${ch}</button>`;
  return `<div class="hcrow ${on ? "" : "off"}"><span class="hi" style="background:${k.color}22;color:${k.color}" aria-hidden="true">${k.icon}</span>
    <div class="hc-main"><b>${esc(p.name || t(k.label))}</b><small class="muted">${esc(sub || t("没有设时间点"))}</small></div>
    <span class="hc-acts"><button class="chip" data-act="hc-toggle" data-pid="${esc(p.id)}" aria-pressed="${on}">${on ? t("显示中") : t("已隐藏")}</button>
      ${mv(-1, "上移", "↑", i === 0)}${mv(1, "下移", "↓", i === n - 1)}<button class="chip" data-act="habit-edit" data-pid="${esc(p.id)}">${t("编辑")}</button></span></div>`;
}
function viewHeroCfg(){
  const list = listNow();
  return `<p class="small muted">${t("今天页顶上可以左右滑的卡片。第一张是问候卡，固定在最前；下面这些卡片可以隐藏（比如病好了不用再吃药）、调整先后。")}</p>
  <div class="panel hclist"><div class="hcrow fixed"><span class="hi" aria-hidden="true">☀</span><div class="hc-main"><b>${t("问候卡")}</b><small class="muted">${t("日期、问候，补记前几天也在这里切换")}</small></div><span class="hc-acts"><span class="ui-badge">${t("固定")}</span></span></div>
    ${list.map((p, i) => row(p, i, list.length)).join("") || `<div class="empty" style="margin:12px 0">${t("还没有用药或保健品。")}</div>`}</div>
  <div class="btns"><button class="btn primary" data-act="habit-add-kind" data-kind="med">＋ ${t("添加用药")}</button><button class="btn" data-act="habit-add-kind" data-kind="supplement">＋ ${t("添加保健品")}</button></div>`;
}
async function heroCfgAct(act, d){
  const p = wb.practice(d.pid);
  if (act === "hc-toggle" && p) { await wb.upsertPractice({ ...p, meta: { ...(p.meta || {}), hero: !heroOn(p) } }); toast(heroOn(p) ? t("已隐藏") : t("已显示")); }
  if (act === "hc-move" && p) { const ids = listNow().map(x => x.id); await wb.saveSettings({ heroOrder: moveId(ids, p.id, +d.dir) }); }
}
export { viewHeroCfg, heroCfgAct };
