import { myName } from "./core/auth.js";
import { APP_VERSION, SISTER_APPS, THIS_APP } from "./core/config.js";
import { t, tc } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc } from "./core/util.js";
import { routeNav } from "./ui.js";

/* ============ “我的”页：不常用的入口收到一处 ============ */
const mrow = (act, title, desc, icon, badge) => `<button class="ui-row mrow" ${act}><span class="mi" aria-hidden="true">${icon}</span><span class="mt"><b>${title}</b>${desc ? `<small>${desc}</small>` : ""}</span>${badge ? `<span class="mbadge">${badge}</span>` : ""}<span class="ui-chev" aria-hidden="true">›</span></button>`;
function viewMe(){
  const ready = S.cloud === "ready" && S.wb.loaded;
  const who = ready ? esc(myName()) : S.cloud === "signedout" ? t("还没登录") : S.cloud === "anon" ? t("请绑定邮箱") : "";
  const link = a => `<a class="ui-row mrow" href="${a.url}"><span class="mi" aria-hidden="true">↗</span><span class="mt"><b>${esc(t(a.name))}</b><small>${tc(esc(a.desc))}</small></span><span class="ui-chev" aria-hidden="true">›</span></a>`;
  return `${routeNav([{ label: t("我的") }])}
  ${who ? `<p class="small muted" style="margin-top:12px">${who}</p>` : ""}
  <div class="msec">${t("提醒与设置")}</div>
  <div class="panel mlist">
    ${ready ? mrow('data-act="calendar"', t("日历订阅提醒"), t("把提醒放进手机日历，到点响铃"), "⏰") : ""}
    ${mrow('data-act="settings"', t("设置"), t("账号与家庭、语言、显示"), "⚙")}
    ${mrow('data-act="bk-open"', t("备份与恢复"), t("定时备份到云端 / 电脑文件夹 / 下载；换手机或重建数据库时导回来"), "🛟")}
    ${mrow('data-act="about"', t("介绍"), t("为什么叫牧羊人、每页怎么用、数据与隐私"), "✎")}
    ${mrow('data-tab="releases"', t("发布日志"), t("每次更新了什么"), "📰")}
  </div>

  <h2>${t("姊妹应用")}</h2>
  <div class="panel mlist">${SISTER_APPS.filter(a => a.id !== THIS_APP).map(link).join("")}</div>
  <p class="small muted">${t("同一个账号、同一个家庭，四个站点互通。")}</p>
  <p class="small muted" style="margin-top:24px">${t("牧羊人")} · <button type="button" class="vlink" data-tab="releases" aria-label="${t("发布日志")} · ${t("版本")} ${APP_VERSION}">${t("版本")} ${APP_VERSION}</button></p>`;
}

export { viewMe, mrow };
