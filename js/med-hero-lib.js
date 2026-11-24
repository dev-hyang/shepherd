/* ============ 今天页顶部「距上次用药」大卡片：纯逻辑 ============
   用药 / 保健品是「习惯」的一种（kind = med / supplement，mode = slots：按时间点打卡）。这里只算：
   哪些药要出大卡片、上次什么时候服的、下一个该服的时间点。不碰页面（测试见 tests/med-hero-lib.test.mjs）。
   显示开关存在习惯的 meta.hero（true / false）：没设过时，用药默认显示，保健品默认不显示；康复后关掉就不再出现。 */

const pad = n => String(n).padStart(2, "0");
const dayStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** 这项习惯的大卡片开着吗（没设过：用药开、保健品关） */
const heroOn = p => !!p && ["med", "supplement"].includes(p.kind) && !!((p.meta || {}).hero ?? p.kind === "med");

/** 要出大卡片的药：进行中、没归档、开关开着，按名字排 */
const heroMeds = practices => (practices || []).filter(p => p && p.active !== false && !p.archived && heroOn(p));

/** 上一次「服了」：{ ts, slot, day }，从没服过返回 null（跳过不算） */
function lastTaken(logs, pid){
  let best = null;
  for (const l of logs || []) if (l.practice_id === pid && l.data && l.data.taken && (!best || l.ts > best.ts)) best = { ts: l.ts, slot: l.data.slot || "", day: l.day };
  return best;
}

/** 下一个该服的时间点：今天还没打卡的最早一个（已过的算 overdue），今天都打完就往后找下一个有安排的日子；没填时间点返回 null */
function nextDose(p, logs, now = new Date()){
  const times = ((p.schedule && p.schedule.times) || []).slice().sort(); if (!times.length) return null;
  const days = p.schedule && p.schedule.days && p.schedule.days.length ? p.schedule.days.map(Number) : ALL_DAYS;
  const mine = (logs || []).filter(l => l.practice_id === p.id);
  for (let off = 0; off < 8; off++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    if (!days.includes(d.getDay())) continue;
    const key = dayStr(d);
    for (const tm of times) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(tm); if (!m) continue;
      if (off === 0 && mine.some(l => l.day === key && l.data && l.data.slot === tm)) continue;   // 今天这个点已经服了 / 跳过
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]).getTime();
      return { time: tm, ts, day: key, off, overdue: ts < now.getTime() };
    }
  }
  return null;
}

/** 服药时机 + 医嘱备注，一句话：「饭后 30 分钟 · 胃不舒服就停」；都没填返回空字符串。t：翻译函数 */
function howText(meta, t){
  const m = meta || {}, tm = m.timing || "";
  const when = !tm ? "" : ["饭前", "饭后"].includes(tm) && +m.mins > 0 ? t(tm === "饭前" ? "饭前 {n} 分钟" : "饭后 {n} 分钟", { n: +m.mins }) : t(tm);
  return [when, m.note || ""].filter(Boolean).join(" · ");
}

export { howText, heroOn, heroMeds, lastTaken, nextDose, dayStr };
