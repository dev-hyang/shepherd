import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { dueItems, labFlag, daysBetween } from "./health-lib.js";
import { kpiCard } from "./kpi.js";
import { fbar } from "./ui.js";

/* ============ 健康页的统一头部：筛选条（人员 + 眼睛）、概览顶部的四张摘要卡 ============
   筛选条用全站同一个 fbar：点「筛选」展开面板，里面有
   · 人员（第一个 = 我自己，默认就是当前登录的人；选了别人会在条下面显示成可点掉的小标签）
   · 眼睛：健康数值默认遮挡（模糊），打开后显示；每次从别的页进健康页都重新遮上。遮挡只是视觉模糊，不改数据。
   页面的目录按钮在路径栏里（ui.crumbHTML），新增用右下角 ＋ 展开的小菜单（ui.fabMenu）。 */
/* 页面自己的搜索框 / 筛选项（就诊列表等）先登记在这里，下面的 filterBar 合并成同一条：[页面名] [搜索] [筛选]（人员、数值显示 + 页面自己的项都在筛选面板里） */
let pageBar = null;
const setPageBar = spec => { pageBar = spec; };
function filterBar(ui, ppl, title = ""){
  const who = { label: "人员", opts: ppl.map(p => ({ label: `${p.kid ? "🧒 " : ""}${p.name}${p.me ? ` (${t("我")})` : ""}`, attrs: `data-hl="who" data-key="${p.key}"`, on: p.key === ui.who })) };
  const eye = { label: "👁 健康数值", opts: [{ label: t("隐藏"), attrs: 'data-hl="eye" data-v="0"', on: !ui.show }, { label: t("显示"), attrs: 'data-hl="eye" data-v="1"', on: !!ui.show }] };
  const pb = pageBar || {}; pageBar = null;
  return fbar({ id: "hl", title, q: pb.q || null, groups: [who, eye, ...(pb.groups || [])] });
}

/** 概览顶部四张卡：待办、上次就诊、异常化验、近 30 天测量。只放条数和日期，不放数值 */
function summaryHTML(who, data){
  const due = dueItems({ data, today: S.day, kid: who.kid }), urgent = due.some(x => x.level === "due");
  const last = [...data.visits].sort((a, b) => b.day.localeCompare(a.day))[0], ago = last ? daysBetween(last.day, S.day) : null;
  const byKey = new Map(); for (const x of [...data.labs].sort((a, b) => a.day.localeCompare(b.day))) byKey.set(x.code || x.name, x);
  const abn = [...byKey.values()].filter(x => labFlag(x)).length;
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), meas = data.measures.filter(m => m.day >= from), lm = [...data.measures].sort((a, b) => b.day.localeCompare(a.day))[0];
  return `<div class="kpis k4">
    ${kpiCard({ label: `🔔 ${t("待办")}`, value: due.length || "✓", unit: due.length ? t("项") : "", sub: urgent ? t("有已到期的") : due.length ? t("复诊 / 体检 / 复查") : t("没有要做的"), state: urgent ? "warn" : due.length ? "" : "done", target: "hl-due" })}
    ${kpiCard({ label: `🩺 ${t("上次就诊")}`, value: last ? last.day.slice(5).replace("-", "/") : "–", sub: last ? (ago === 0 ? t("今天") : t("{n} 天前", { n: ago })) : t("还没有记录"), target: "hl:visits" })}
    ${kpiCard({ label: `🧪 ${t("异常化验")}`, value: abn, unit: t("项"), sub: byKey.size ? t("共 {n} 项最新结果", { n: byKey.size }) : t("还没有化验"), state: abn ? "warn" : byKey.size ? "done" : "", target: "hl:labs" })}
    ${kpiCard({ label: `⚖ ${t("近 30 天测量")}`, value: meas.length, unit: t("次"), sub: lm ? t("最近 {d}", { d: lm.day.slice(5).replace("-", "/") }) : t("还没有记录"), target: "hl:measures" })}</div>`;
}

export { filterBar, setPageBar, summaryHTML };
