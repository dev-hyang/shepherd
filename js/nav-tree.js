import { t } from "./core/i18n.js";
import { S } from "./core/state.js";

/* ============ 全站目录（路径栏的「目录」按钮）：一棵完整的页面树 ============
   每页路径栏的目录都列这同一棵树，当前页打勾；点一项 = 跳到对应网址（data-go），网址和路径栏的层级一致，浏览器的后退 / 前进也能用。
   网址写法在 views.js（routeOf / readRoute）；这里的 hash 要和它们一致。 */
const TREE = [
  ["今天", "#/", [
    ["习惯", "#/today/habits", [["记录", "#/today/habits/records"], ["顶部卡片", "#/today/habits/herocfg"]]]]],
  ["任务", "#/tasks", [["今日", "#/tasks/today"], ["清单", "#/tasks/list"], ["计划", "#/tasks/plan"]]],
  ["健康", "#/health", [["概览", "#/health"], ["就诊", "#/health/visits"], ["化验", "#/health/labs"], ["测量", "#/health/measures"], ["计划", "#/health/plan"], ["训练", "#/health/workout"], ["饮食", "#/health/diet"], ["档案", "#/health/profile"]]],
  ["祷告", "#/prayer", [["读经", "#/prayer/read"], ["灵修", "#/prayer/notes"], ["祷告", "#/prayer/pray"]]],
  ["我的", "#/me", [["发布日志", "#/me/releases"]]],
];

/** 当前页的网址（和 views.js 的 routeOf 同一套；这里只要「页面级」，不含详情 id） */
function currentHash(){
  const tab = S.tab, hu = S.hlUi || {};
  if (tab === "today") return "#/";
  if (tab === "habits") return "#/today/habits";
  if (tab === "records") return "#/today/habits/records";
  if (tab === "herocfg") return "#/today/habits/herocfg";
  if (tab === "releases") return "#/me/releases";
  if (tab === "tasks") { const s = (S.tkUi || {}).seg; return !s || s === "home" ? "#/tasks" : "#/tasks/" + s; }
  if (tab === "prayer") return !S.prayerView || S.prayerView === "home" ? "#/prayer" : "#/prayer/" + S.prayerView;
  if (tab === "health") { const v = ({ visit: "visits", lab: "labs" })[hu.view] || hu.view; return !v || v === "overview" ? "#/health" : "#/health/" + v; }
  return "#/" + tab;
}
/** 目录树结点（给 shared/ui-tree.js）：[{ label, attrs, on, children }]；健康「概览」就是健康根页，不重复列 */
function dirTree(){
  const cur = currentHash();
  const walk = (nodes, parentHash) => nodes.filter(([, hash]) => !(parentHash && hash === parentHash)).map(([label, hash, kids]) => ({ label: t(label), attrs: `data-go="${hash}"`, on: hash === cur, children: kids ? walk(kids, hash) : null }));
  return walk(TREE, "");
}

export { dirTree, currentHash, TREE };
