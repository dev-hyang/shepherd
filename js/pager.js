import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { loadJSON, saveJSON } from "./core/util.js";

/* ============ 长列表分批显示（代祷、任务清单、已完成 / 放弃的共用）============
   筛选、排序、分组、计数都照旧按完整的结果算，只是先画前 limit(key) 条；还有没画的，底部放一个“继续加载”，每点一次多画一页。
   灵修笔记不在内存里分批：每次“继续加载”向数据库要下一页（js/nt.js，键集分页），只借用这里的 pageSize()。
   每页几条是整个应用一个设置，记在本机（设置 → 显示）；没设过时手机 10 条、电脑 20 条。
   换筛选 / 搜索 / 子页、从别处跳进来时 reset(key)，回到第一页。 */
const SIZES = [5, 10, 20, 50];
const KEY = LS_PREFIX + ".pageSize";
const shown = {};   // key → 现在画了几条；没有 = 一页

function pageSize(){
  const v = +loadJSON(KEY, 0); if (SIZES.includes(v)) return v;
  try { return matchMedia("(max-width: 640px)").matches ? 10 : 20; } catch (e) { return 20; }
}
function setPageSize(n){ if (!SIZES.includes(+n)) return; saveJSON(KEY, +n); resetAll(); }
const limit = key => shown[key] || pageSize();
const page = (key, list) => list.slice(0, limit(key));
function more(key){ shown[key] = limit(key) + pageSize(); }
function reset(...keys){ keys.forEach(k => delete shown[k]); }
function resetAll(){ Object.keys(shown).forEach(k => delete shown[k]); }
/** 还有没画的就给一个“继续加载”按钮（events.js 按 data-pager-more 处理） */
const moreBtn = (key, total) => (total > limit(key) ? `<div class="btns" style="margin-top:8px"><button class="btn" data-pager-more="${key}">${t("继续加载")}</button></div>` : "");

export { SIZES, pageSize, setPageSize, limit, page, more, reset, resetAll, moreBtn };
