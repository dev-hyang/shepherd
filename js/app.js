/* ============ boot ============
   模块顺序：core/config → core/util → core/state → wb ↔ core/auth ↔ views ↔ sheet → events。
   跨模块调用都在函数体内，循环引用是安全的。 */
import { t } from "./core/i18n.js";
import { initSwipeRows } from "./swipe-rows.js";
import "./events.js";
import { initSupabase } from "./core/auth.js";
import { APP_VERSION } from "./core/config.js";
import { S } from "./core/state.js";
import { dayKey } from "./core/util.js";
import { render } from "./views.js";

/* 发布后的头几分钟，浏览器可能把新的 index.html 和缓存里的旧模块混在一起（内部 import 没有版本号）。
   index.html 里的 meta 版本与 config.js 不一致时，强制重新抓取所有模块并刷新一次。 */
const MODULES = ["app", "events", "views", "minibar", "swipe-rows", "sheet", "today", "prayer", "review", "me", "about", "wb", "focus", "tk", "tasks", "recur", "nt", "notes", "notes-lib", "markdown", "ai", "data/taskcats",
  "core/config", "core/util", "core/state", "core/auth", "core/i18n", "data/s2t", "data/i18n-en", "data/bible", "data/plans", "data/kinds", "data/about"].map(m => `js/${m}.js`);
async function healStaleModules(){
  const want = (document.querySelector('meta[name="app-version"]') || {}).content;
  if (!want || want === APP_VERSION) return false;
  const key = "shepherd.reloaded." + want;
  try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, "1"); } catch (e) { return false; }
  await Promise.all(MODULES.map(u => fetch(u, { cache: "reload" }).catch(() => null)));
  location.reload(); return true;
}

if (!(await healStaleModules())) {
  { const v = document.getElementById("appver"); if (v) v.textContent = "v" + APP_VERSION; } // 顶栏版本号：不用翻到最后一页就能对照有没有更新
  initSwipeRows({ kinds: ["log", "dropped-task", "extra-read"], del: () => t("删除"), release: () => t("松手删除") });   // 行记录左滑删除（js/swipe-rows.js）
  render();          // 先画出"连接中"的壳
  initSupabase();    // 加载 supabase-js，登录状态回调里再渲染一次
  // 页面开着过了午夜：换到新的一天
  setInterval(() => { const d = dayKey(Date.now()); if (d !== S.day) { S.day = d; if (S.pick === d) S.pick = null; if (!document.querySelector("#sheet").open) render(); } }, 60e3);
}
