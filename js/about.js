import { APP_VERSION, SISTER_APPS, THIS_APP } from "./core/config.js";
import { t, tc } from "./core/i18n.js";
import { $, esc } from "./core/util.js";
import { ABOUT } from "./data/about.js";
import { showSheet } from "./sheet.js";

/* ============ 介绍页 ============ */
function openAbout(){
  const A = ABOUT, c = s => tc(esc(s));
  $("#sheetIn").innerHTML = `<div class="sheet-head"><h3 id="sheetTitle">${esc(t("关于牧羊人"))}</h3><span><button class="iconbtn" data-act="close" aria-label="${esc(t("关闭"))}">${esc(t("关闭"))}</button></span></div>
  <p>${c(A.intro)}</p>
  <h2>${t("设计原则")}</h2>
  <div class="panel"><ol class="plain" style="padding-left:20px">${A.principles.map(([k, d]) => `<li style="margin:6px 0"><b>${c(k)}。</b>${c(d)}</li>`).join("")}</ol></div>
  <h2>${t("每一页怎么用")}</h2>
  <div class="panel scroll-x"><table><tbody>${A.pages.map(([p, d]) => `<tr><th style="width:18%">${c(p)}</th><td>${c(d)}</td></tr>`).join("")}</tbody></table></div>
  <h2>${t("数据与隐私")}</h2>
  <div class="panel"><p class="small">${c(A.data)}</p><p class="small muted">${t("姊妹应用：")}${SISTER_APPS.filter(a => a.id !== THIS_APP).map(a => `<a href="${a.url}">${esc(t(a.name))}</a>`).join(" · ")} · ${t("版本")} ${APP_VERSION}</p></div>`;
  showSheet();
}

export { openAbout };
