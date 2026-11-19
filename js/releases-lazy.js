/* 发布日志数据（js/data/releases.js，约 29KB）按需加载：只有「新版本」提示还会出现、或打开发布日志页时才下载。
   页面和提示的代码在 js/releases-ui.js（姊妹应用共用，不改）；这里只负责什么时候把数据交给它。 */
import { importFresh } from "./core/lazy-reload.js";
import { initReleases, releasePageHTML } from "./releases-ui.js";
import { APP_VERSION } from "./core/config.js";
import { locale, t } from "./core/i18n.js";

let ready = false, loading = null;
function loadReleases(){
  return (loading ||= importFresh(() => import("./data/releases.js")).then(({ RELEASES }) => {
    initReleases({ version: APP_VERSION, releases: RELEASES, lang: locale, accent: "var(--slate)", appId: "shepherd", open: 'data-tab="releases"' });
    ready = true;
    document.dispatchEvent(new Event("releases-loaded"));   // 今天页的提示 / 发布日志页据此重画
  }).catch(() => { loading = null; }));
}
/** 「新版本」提示这台设备还会不会出现（读 releases-ui.js 记的 seen / shows）：不会了就不必为它下载数据 */
function releaseBadgePossible(){
  try {
    if (localStorage.getItem("shepherd.rl.seen") === APP_VERSION) return false;
    const o = JSON.parse(localStorage.getItem("shepherd.rl.shows") || "{}");
    return !(o.v === APP_VERSION && +o.n >= 5);
  } catch (e) { return true; }
}
/** 发布日志页：数据到了才画；没到先显示「加载中」，并去加载 */
function releasesView(){
  if (ready) return releasePageHTML();
  loadReleases();
  return `<p class="small muted" role="status">${t("加载中…")}</p>`;
}
export { loadReleases, releaseBadgePossible, releasesView };
