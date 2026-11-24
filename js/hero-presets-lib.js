/* ============ 今天页顶部「距上次」预设卡片：纯逻辑 ============
   预设卡片有五种：读经祷告（合并）、锻炼、陪伴妻子、陪伴孩子、休息（喝水 / 放松眼睛 / 上厕所 / 起身活动，合并）。
   读经、祷告、锻炼复用已有的习惯记录；陪伴和休息是「自定义」习惯 + meta.preset（不用改数据库），一次一条记录，
   休息类的记录里 data.what 记是哪一项。显示开关在个人设置 heroPresets，顺序和药卡一起记在 heroOrder。
   卡片的 id：药 = 习惯 id；预设 = "preset:<key>"。不碰页面和数据库（测试见 tests/hero-presets-lib.test.mjs）。 */
import { heroOn, medCandidates, orderBy } from "./med-hero-lib.js";

const PRESETS = {
  faith:    { icon: "📖", label: "读经祷告", desc: "距上次读经、距上次祷告；点一下记一次", kinds: ["scripture", "prayer"],
              items: [{ k: "scripture", icon: "📖", label: "读经", warn: 30 }, { k: "prayer", icon: "🕊", label: "祷告", warn: 30 }] },
  exercise: { icon: "🏃", label: "锻炼", desc: "距上次锻炼；点一下记分钟数", kinds: ["exercise"], items: [{ k: "exercise", icon: "🏃", label: "锻炼", warn: 72 }] },
  spouse:   { icon: "💑", label: "陪伴妻子", desc: "距上次陪妻子聊天、相处", items: [{ k: "spouse", icon: "💑", label: "陪伴妻子", warn: 48 }] },
  kid:      { icon: "🧒", label: "陪伴孩子", desc: "距上次陪孩子玩、聊天、读书", items: [{ k: "kid", icon: "🧒", label: "陪伴孩子", warn: 24 }] },
  rest:     { icon: "☕", label: "休息", desc: "喝水、放松眼睛、上厕所、起身活动，各记各的",
              items: [{ k: "water", icon: "💧", label: "喝水", warn: 4 }, { k: "eyes", icon: "👀", label: "放松眼睛", warn: 3 }, { k: "wc", icon: "🚻", label: "上厕所" }, { k: "move", icon: "🚶", label: "起身活动", warn: 2 }] }
};
const PRESET_KEYS = Object.keys(PRESETS);
const cardId = key => "preset:" + key;
const keyOf = id => (String(id).startsWith("preset:") ? String(id).slice(7) : "");

/** 陪伴 / 休息这两类自定义习惯（没有就是 null） */
const practiceOf = (practices, key) => (practices || []).find(p => p && p.kind === "custom" && p.meta && p.meta.preset === key && !p.archived) || null;
/** 这个预设背后的习惯：读经 / 祷告 / 锻炼按种类找，陪伴 / 休息按 preset 找；item 指定是其中哪一项 */
function practiceFor(practices, key, item){
  const P = PRESETS[key]; if (!P) return null;
  if (!P.kinds) return practiceOf(practices, key);
  return (practices || []).find(p => p && p.kind === (item ? item.k : P.kinds[0]) && !p.archived) || null;
}
const hasPractice = (practices, key) => PRESETS[key].kinds ? PRESETS[key].kinds.some(k => practiceFor(practices, key, { k })) : !!practiceOf(practices, key);

/** 开着吗：用户设过就听用户的；没设过，读经祷告 / 锻炼在有对应习惯时默认开，其余默认关 */
function presetOn(key, settings, practices){
  const v = ((settings || {}).heroPresets || {})[key];
  return v != null ? !!v : !!PRESETS[key].kinds && hasPractice(practices, key);
}

/** 这一项上一次记录的时间（毫秒），没有返回 null */
function lastTs(logs, practices, key, item){
  const P = PRESETS[key]; let list;
  if (P.kinds) list = (logs || []).filter(l => l.kind === item.k);
  else { const p = practiceOf(practices, key); if (!p) return null; list = (logs || []).filter(l => l.practice_id === p.id && (key !== "rest" || (l.data && l.data.what) === item.k)); }
  return list.reduce((m, l) => Math.max(m, l.ts), 0) || null;
}
/** 这张预设卡的提醒关了吗（个人设置 heroAlertOff：关掉提醒的预设 key 列表） */
const alertOff = (key, settings) => ((settings || {}).heroAlertOff || []).includes(key);
/** 这一项多久没记了、超过没有：超过返回 { hours, warn }（小时），没超过 / 没记录过 / 关了提醒 / 休息类在夜里（22:00–08:00）返回 null。item.warn = 默认几小时算该留意 */
function overdue(key, item, ts, now, settings){
  if (!item.warn || ts == null || alertOff(key, settings)) return null;
  if (key === "rest") { const h = new Date(now).getHours(); if (h < 8 || h >= 22) return null; }
  const gap = now - ts;
  return gap > item.warn * 3600e3 ? { hours: Math.floor(gap / 3600e3), warn: item.warn } : null;
}
/** 记一次要写的内容：休息类带上是哪一项 */
const logData = (key, item) => (key === "rest" ? { what: item.k } : {});
/** 休息记录里 what 对应的中文名（记录页显示用） */
const whatLabel = what => { const it = PRESETS.rest.items.find(i => i.k === what); return it ? it.label : ""; };

/** 今天页要出的卡片（已排好序）：开着的药卡 + 开着的预设；order = 个人设置 heroOrder（id 列表） */
function shownCards(practices, settings){
  const meds = medCandidates(practices).filter(heroOn).map(p => ({ id: p.id, type: "med", p }));
  const presets = PRESET_KEYS.filter(k => presetOn(k, settings, practices)).map(k => ({ id: cardId(k), type: "preset", key: k }));
  return orderBy([...meds, ...presets], (settings || {}).heroOrder);
}
/** 管理页要列的全部卡片（含隐藏的，已排好序）：on 表示现在开着 */
function allCards(practices, settings){
  const meds = medCandidates(practices).map(p => ({ id: p.id, type: "med", p, on: heroOn(p) }));
  const presets = PRESET_KEYS.map(k => ({ id: cardId(k), type: "preset", key: k, on: presetOn(k, settings, practices) }));
  return orderBy([...meds, ...presets], (settings || {}).heroOrder);
}
/** 新建「陪伴 / 休息」习惯的内容（读经祷告 / 锻炼用 data/kinds.js 的起步模板补，不在这里） */
const presetPractice = key => ({ kind: "custom", name: PRESETS[key].label, target: { per: "day", count: 1 }, schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: [], remind: false }, meta: { preset: key }, share: "private" });

export { alertOff, overdue, PRESETS, PRESET_KEYS, cardId, keyOf, practiceOf, practiceFor, hasPractice, presetOn, lastTs, logData, whatLabel, shownCards, allCards, presetPractice };
