import { dashBarHTML, dashGearHTML, dashSecs, markDash, watchDashCycle } from "./shared/ui-dashbar.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { esc, hm } from "./core/util.js";
import { kindOf } from "./data/kinds.js";
import { bigDur } from "./hero-dur.js";
import { presetCard } from "./hero-presets.js";
import { shownCards } from "./hero-presets-lib.js";
import { bySlots, howText, lastTaken, nextByHours, nextDose } from "./med-hero-lib.js";

/* ============ 今天页顶上的滑动卡：问候卡 + 每种药一张「距上次用药」 ============
   左右滑（或点下面的小圆点）切换。每种药的卡片显示：多久没服、上次几点、下一个时间点（过了就变暖色）、剂量和库存，
   「服了 / 跳过」直接记在下一个时间点上。康复了点「不再显示」，卡片就不出现（习惯与用药里随时能重新打开）。
   只在看今天时出现；补记前几天时只剩问候卡。 */
const GAP = 10;   // 和 app.css 里 .herotrack 的 gap 一致

function nextText(n){
  if (!n) return t("没有设时间点");
  if (n.overdue) return `<b>${t("该服了 {time}", { time: n.time })}</b>`;
  return n.off === 0 ? t("下次 {time}", { time: n.time }) : n.off === 1 ? t("下次 明天 {time}", { time: n.time }) : t("下次 {day} {time}", { day: n.day.slice(5).replace("-", "/"), time: n.time });
}
/** 按最短间隔：几点后可再服 / 已过医嘱间隔；没填间隔就没有这句 */
function waitText(nx, now){
  if (!nx) return "";
  if (nx <= now.getTime()) return t("已过医嘱间隔");
  return t("{time} 后可再服", { time: `${new Date(nx).toDateString() === now.toDateString() ? "" : t("明天") + " "}${hm(nx)}` });
}
function medCard(p, now){
  const k = kindOf(p), m = p.meta || {}, last = lastTaken(S.wb.logs, p.id), slots = bySlots(p), n = slots ? nextDose(p, S.wb.logs, now) : null;
  const stock = m.stock != null && m.stock !== "" ? t("剩 {n}", { n: m.stock }) : "";
  const meta = [last ? t("上次 {time}", { time: hm(last.ts) }) : "", slots ? nextText(n) : waitText(nextByHours(p, last), now), m.dose ? esc(m.dose) : "", stock].filter(Boolean).map(x => `<span>${x}</span>`).join("");
  const how = howText(m, t);   // 服药时机 + 医嘱：一行，放不下就省略号（完整内容在习惯里看）
  const act = !slots ? `<button class="hbtn txt" data-act="dose" data-pid="${esc(p.id)}">${t("服了")}</button>` : n && n.off === 0 ? `<button class="hbtn txt" data-act="slot" data-pid="${esc(p.id)}" data-slot="${esc(n.time)}" data-v="taken">${t("服了")}</button><button class="hbtn txt" data-act="slot" data-pid="${esc(p.id)}" data-slot="${esc(n.time)}" data-v="skip">${t("跳过")}</button>` : "";
  return `<section class="hero medhero${n && n.overdue ? " due" : ""}" aria-label="${esc(p.name || t(k.label))}"><div class="moon"></div>
    <div class="lbl">${k.icon} ${t("距上次")} ${esc(p.name || t(k.label))}</div>
    <div class="big num">${last ? bigDur(now.getTime() - last.ts) : t("还没记录")}</div>
    <div class="meta">${meta}</div>
    ${how ? `<div class="hero-sub" title="${esc(how)}">${esc(how)}</div>` : ""}
    <div class="medact">${act}<button class="hbtn txt" data-act="rec-open" data-pid="${esc(p.id)}">${t("历史")}</button><button class="hbtn txt" data-act="med-hero-off" data-pid="${esc(p.id)}" title="${esc(t("病好了、不用再吃时点这里；在「习惯与用药」里能重新打开"))}">${t("隐藏")}</button></div></section>`;
}

/** 问候卡 +（今天有药时）药卡，包成可滑动的一排；没有药卡就原样返回问候卡 */
function heroTrackHTML(greetHero, past){
  if (past) return greetHero;
  const cards = shownCards(S.wb.practices, (S.wb.profile || {}).settings);
  if (!cards.length) return greetHero || "";
  const now = new Date(), slides = [greetHero, ...cards.map(c => (c.type === "med" ? medCard(c.p, now) : presetCard(c.key, now)))].filter(Boolean), cur = Math.min(S.heroIdx || 0, slides.length - 1);
  const secs = dashSecs("shepherd.cardSecs"), manage = `<button type="button" class="ui-dash-opt" data-tab="herocfg">${t("管理卡片")}</button>`;   // ⚙ 菜单：自动切换的秒数 + 管理卡片（显示 / 隐藏、调顺序）
  return `<div class="herobox" data-dash-host><div class="herotrack" id="heroTrack" tabindex="0" role="region" aria-roledescription="carousel" aria-label="${esc(t("今天：问候与卡片"))}">${slides.join("")}</div>
    ${dashBarHTML(slides.length, cur, { clickable: true, attrs: 'data-act="hero-go"', nav: true, navAttrs: 'data-act="hero-nav"', gear: dashGearHTML({ secs, extra: manage, t }), secs, label: "切换卡片", t })}</div>`;
}

const track = () => document.getElementById("heroTrack");
/** render() 画完后调：滑回用户刚才停的那一张 */
function restoreHero(){
  const el = track(); if (!el || !el.clientWidth) return;
  el.scrollTo({ left: (S.heroIdx || 0) * (el.clientWidth + GAP), behavior: "instant" });
}
function goHero(i){ const el = track(); if (el) el.scrollTo({ left: i * (el.clientWidth + GAP), behavior: "smooth" }); }
/** 上一张 / 下一张，循环：最后一张再往后回到第一张（自动切换走满也是这样） */
function stepHero(d){ const n = document.querySelectorAll(".herobox .ui-dash").length; if (n > 1) goHero((((S.heroIdx || 0) + d) % n + n) % n); }
watchDashCycle({ key: "shepherd.cardSecs", next: () => stepHero(1) });
// 手滑时记下停在哪一张、同步小圆点（scroll 不冒泡，用捕获）
document.addEventListener("scroll", e => {
  const el = e.target; if (!el || el.id !== "heroTrack") return;
  const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth + GAP)); if (i === S.heroIdx) return;
  S.heroIdx = i; markDash(document.querySelector(".herobox .ui-dashbar"), i);   // 同步横条，进度条从头走
}, true);

export { heroTrackHTML, restoreHero, goHero, stepHero };
