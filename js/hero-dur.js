import { t } from "./core/i18n.js";

/** 顶部大卡片上的时长：「3 小时 30 分」「2 天 5 小时」「45 分钟」（带 <small> 单位的 HTML） */
function bigDur(ms){
  const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}<small>${t("天")}</small>${h % 24}<small>${t("小时")}</small>` : h ? `${h}<small>${t("小时")}</small>${m % 60}<small>${t("分")}</small>` : `${m}<small>${t("分钟")}</small>`;
}
/** 小格子里的一句：「35 分钟前」「2 小时前」「3 天前」 */
function agoText(ms){
  const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? t("{n} 天前", { n: d }) : h ? t("{n} 小时前", { n: h }) : t("{n} 分钟前", { n: m });
}
export { bigDur, agoText };
