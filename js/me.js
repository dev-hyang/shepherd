import { myName } from "./core/auth.js";
import { APP_VERSION, SISTER_APPS, THIS_APP } from "./core/config.js";
import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";

/* ============ “我的”页：不常用的入口收到一处 ============ */
const mrow = (act, title, desc, icon, badge) => `<button class="mrow" ${act}><span class="mi" aria-hidden="true">${icon}</span><span class="mt"><b>${title}</b>${desc ? `<small>${desc}</small>` : ""}</span>${badge ? `<span class="mbadge">${badge}</span>` : ""}<span class="mch" aria-hidden="true">›</span></button>`;
function viewMe(){
  const ready = S.cloud === "ready" && S.wb.loaded;
  const who = ready ? esc(myName()) : S.cloud === "signedout" ? t("还没登录") : S.cloud === "anon" ? t("请绑定邮箱") : "";
  const link = a => `<a class="mrow" href="${a.url}"><span class="mi" aria-hidden="true">↗</span><span class="mt"><b>${esc(t(a.name))}</b><small>${tc(esc(a.desc))}</small></span><span class="mch" aria-hidden="true">›</span></a>`;
  const live = ready ? S.wb.practices.filter(p => !p.archived) : [];
  const meds = live.filter(p => ["med", "supplement"].includes(p.kind)).length, habits = live.length - meds;
  return `
  <h2>${t("我的")}${who ? ` <span class="small muted" style="font-family:var(--f-body);font-weight:400">${who}</span>` : ""}</h2>
  ${ready ? `<div class="msec">${t("每天要做的")}</div>
  <div class="panel mlist">
    ${mrow('data-act="habits"', t("习惯与提醒"), t("读经、祷告、锻炼、饮食、屏幕……目标、日子、时间点、家人可见"), "✦", habits || "")}
    ${mrow('data-act="meds"', t("用药与保健品"), t("剂量、时间点、库存与补货提醒"), "💊", meds || "")}
    ${mrow('data-act="focus"', t("专注计时"), t("番茄工作法，每 20 分钟提醒看远处 20 秒护眼；完成的段自动记录"), "🍅")}
    ${mrow('data-act="plan"', t("读经计划"), t("一年通读、新约 90 天、诗篇箴言……或导入自己的；译本"), "📖")}
  </div>` : ""}

  <div class="msec">${t("提醒与设置")}</div>
  <div class="panel mlist">
    ${ready ? mrow('data-act="calendar"', t("日历订阅提醒"), t("把提醒放进手机日历，到点响铃"), "⏰") : mrow('data-act="focus"', t("专注计时"), t("番茄工作法，每 20 分钟提醒看远处 20 秒护眼；完成的段自动记录"), "🍅")}
    ${mrow('data-act="settings"', t("设置"), t("账号与家庭、语言、显示"), "⚙")}
    ${mrow('data-act="about"', t("介绍"), t("为什么叫牧羊人、每页怎么用、数据与隐私"), "✎")}
  </div>

  <h2>${t("姊妹应用")}</h2>
  <div class="panel mlist">${SISTER_APPS.filter(a => a.id !== THIS_APP).map(link).join("")}</div>
  <p class="small muted">${t("同一个账号、同一个家庭，四个站点互通。")}</p>
  <p class="small muted" style="margin-top:24px">${t("牧羊人")} · ${t("版本")} ${APP_VERSION}</p>`;
}

export { viewMe, mrow };
