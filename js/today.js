import { isOwner } from "./core/auth.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import * as wb from "./wb.js";
import { askBody } from "./ask.js";
import { releaseBadgeHTML } from "./releases-ui.js";
import { kpisHTML } from "./today-cards.js";

/* ============ 今天页：五张 dashboard 卡片（习惯、任务、读经、祷告、健康）+ 咩咩咩 ============
   其余内容都搬进各自的页面：习惯 / 补记日期 / 家人 / 药物卡片 → 今天 / 习惯；三件大事、任务、家人的安排 → 任务；读经 → 祷告 / 读经；灵修笔记 → 祷告 / 灵修。 */
function viewToday(){
  const day = wb.viewDay(), past = day !== S.day;
  const list = wb.forDay(day).filter(p => !(p.meta && p.meta.preset));   // 陪伴 / 休息是顶部卡片的记录，不进习惯统计
  const joinNote = isOwner() && S.pending.length ? `<div class="nudge"><b>${t("{n} 人申请加入家庭", { n: S.pending.length })}</b> <button class="chip" data-act="settings">${t("去批准")}</button></div>` : "";
  const pastNote = past ? `<div class="nudge"><b>${t("正在看 {d}", { d: esc(day.slice(5).replace("-", "/")) })}</b> <button class="chip" data-act="day-today">${t("回到今天")}</button></div>` : "";
  return `${releaseBadgeHTML()}${joinNote}${pastNote}${kpisHTML(day, list)}${askBody()}`;
}

export { viewToday };
