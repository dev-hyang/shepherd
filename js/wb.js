import { SB, memberName } from "./core/auth.js";
import { locale, t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { D, dayKey, newId, toast } from "./core/util.js";
import { fetchChapter } from "./data/bible.js";
import { ALL_DAYS, TEMPLATE, modeOf } from "./data/kinds.js";
import { bookZh, planById } from "./data/plans.js";

/* ============ 牧羊人数据层（在线优先） ============
   登录后一次性读取；每次写入直接到 Supabase，成功后更新内存并重绘。
   wb_* 表由 baby-log 仓库本机的 supabase/migrations/013_shepherd.sql 建立；表不存在时 S.wb.error = "missing"。
   所有行都挂在 user_id 上。习惯 share = 'family' 时，这项和它的打卡记录会带上 family_id，家庭成员能读到（只读）；
   祷告清单（wb_prayers）永远只有本人。 */
S.wb = { loaded: false, error: null, profile: null, practices: [], logs: [], prayers: [], fam: { practices: [], logs: [] }, texts: {} };

const HISTORY_DAYS = 84;          // 回顾页最多看 12 周
const me = () => S.user.id;
const today = () => S.day;
const nowIso = () => new Date().toISOString();
const missingTable = err => err && (err.code === "42P01" || err.code === "PGRST205" || /schema cache|does not exist/i.test(err.message || ""));
async function run(p, msg){ const { data, error } = await p; if (error) { console.error(error); toast(t(msg || "云端保存失败") + (error.message ? "：" + String(error.message).slice(0, 80) : "")); throw error; } return data; }
const put = (list, row) => { const i = list.findIndex(x => x.id === row.id && x.user_id === row.user_id); if (i >= 0) list[i] = row; else list.push(row); return row; };
// 从中午算，夏令时切换的那天也不会差一天
const dayAdd = (day, n) => dayKey(new Date(day + "T12:00:00").getTime() + n * D);
const weekday = day => new Date(day + "T12:00:00").getDay();
// 周一为一周的开始
const weekStartOf = day => dayAdd(day, -((weekday(day) + 6) % 7));

async function loadAll(){
  S.wb.loaded = false; S.wb.error = null;
  let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  const lang = locale(); // 日历订阅按这个语言生成事件标题
  const famId = S.family ? S.family.id : null;
  let r = await SB.client.from("wb_profile").select("*").eq("user_id", me()).maybeSingle();
  if (r.error) { console.error(r.error); S.wb.error = missingTable(r.error) ? "missing" : "error"; return; }
  let prof = r.data;
  if (!prof) {
    r = await SB.client.from("wb_profile").insert({ user_id: me(), family_id: famId, settings: { tz, lang } }).select().single();
    if (r.error) { console.error(r.error); S.wb.error = "error"; return; }
    prof = r.data;
  } else if (prof.family_id !== famId || (tz && prof.settings.tz !== tz) || prof.settings.lang !== lang) {
    // 家庭变了（加入 / 离开）、换了时区或界面语言：日历订阅按这里的设置生成
    r = await SB.client.from("wb_profile").update({ family_id: famId, settings: { ...prof.settings, tz: tz || prof.settings.tz, lang } }).eq("user_id", me()).select().single();
    if (!r.error) prof = r.data;
  }
  const from = dayAdd(today(), -HISTORY_DAYS);
  const rs = await Promise.all([
    SB.client.from("wb_practices").select("*").eq("user_id", me()).order("sort"),
    SB.client.from("wb_logs").select("*").eq("user_id", me()).gte("day", from),
    SB.client.from("wb_prayers").select("*").eq("user_id", me()).order("sort")
  ]);
  const bad = rs.find(x => x.error);
  if (bad) { console.error(bad.error); S.wb.error = missingTable(bad.error) ? "missing" : "error"; return; }
  S.wb.profile = prof; S.wb.practices = rs[0].data || []; S.wb.logs = rs[1].data || []; S.wb.prayers = rs[2].data || [];
  S.wb.fam = { practices: [], logs: [] };
  if (famId) {
    const fr = await Promise.all([
      SB.client.from("wb_practices").select("*").eq("family_id", famId).eq("share", "family").neq("user_id", me()),
      SB.client.from("wb_logs").select("*").eq("family_id", famId).eq("share", "family").neq("user_id", me()).gte("day", dayAdd(today(), -7))
    ]);
    if (!fr.some(x => x.error)) S.wb.fam = { practices: fr[0].data || [], logs: fr[1].data || [] };
  }
  // 换了家庭：以前开给旧家庭看的项，重新盖上现在的家庭（没有家庭就收回）
  for (const p of S.wb.practices.filter(p => p.share === "family" && p.family_id !== famId)) await upsertPractice({ ...p, share: famId ? "family" : "private" });
  S.wb.loaded = true;
}

/* ---- 实时：自己在别的设备上的改动，和家人开给我看的打卡 ---- */
function attachRealtime(ch, onChange){
  const apply = (list, payload) => {
    if (payload.eventType === "DELETE") { const o = payload.old || {}; const i = list.findIndex(x => x.id === o.id && (!o.user_id || x.user_id === o.user_id)); if (i >= 0) list.splice(i, 1); }
    else if (payload.new && payload.new.id) put(list, payload.new);
  };
  const mine = "user_id=eq." + me();
  ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_logs", filter: mine }, p => { apply(S.wb.logs, p); onChange(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "wb_practices", filter: mine }, p => { apply(S.wb.practices, p); onChange(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "wb_prayers", filter: mine }, p => { apply(S.wb.prayers, p); onChange(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "wb_profile", filter: mine }, p => { if (p.new && p.new.user_id) S.wb.profile = p.new; onChange(); });
  if (S.family) {
    const fam = "family_id=eq." + S.family.id;
    const theirs = p => (p.new && p.new.user_id !== me()) || (p.old && p.old.user_id && p.old.user_id !== me());
    ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_logs", filter: fam }, p => { if (!theirs(p)) return; apply(S.wb.fam.logs, p); onChange(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wb_practices", filter: fam }, p => { if (!theirs(p)) return; apply(S.wb.fam.practices, p); onChange(); });
  }
}

/* ---- 习惯 ---- */
const practice = id => S.wb.practices.find(p => p.id === id) || null;
const activePractices = () => S.wb.practices.filter(p => p.active !== false && !p.archived);
// 建立之前的日子不算"排了"，回顾页才不会把没开始的日子算成没做
const scheduledOn = (p, day) => {
  if (p.created_at && day < dayKey(new Date(p.created_at).getTime())) return false;
  const days = (p.schedule && Array.isArray(p.schedule.days) && p.schedule.days.length) ? p.schedule.days : ALL_DAYS;
  return (p.target && p.target.per === "week") || days.includes(weekday(day));
};
const forDay = (day = today()) => activePractices().filter(p => scheduledOn(p, day));
const logsFor = (pid, day) => S.wb.logs.filter(l => l.practice_id === pid && l.day === day);
const logsOfKind = (kind, day) => S.wb.logs.filter(l => l.kind === kind && l.day === day);
const firstOfKind = kind => activePractices().find(p => p.kind === kind) || null;

// 今天（或某天）这项做到什么程度；logs 可传入（看家人的记录时用）
function statusOf(p, day = today(), logs = logsFor(p.id, day)){
  const mode = modeOf(p), tg = p.target || {};
  switch (mode) {
    case "count": return { mode, done: logs.length >= (tg.count || 1), count: logs.length };
    case "minutes": { const minutes = logs.reduce((s, l) => s + (+l.data.minutes || 0), 0); return { mode, minutes, sessions: logs.length, done: tg.per === "week" ? logs.length > 0 : minutes >= (tg.minutes || 1) }; }
    case "rating": { const l = logs[0]; return { mode, done: !!l, rating: l ? +l.data.rating : null, log: l || null }; }
    case "value": { const l = logs[0]; const v = l ? +l.data.value : null; return { mode, done: !!l, value: v, log: l || null, over: v != null && tg.max != null && v > tg.max, under: v != null && tg.min != null && v < tg.min }; }
    case "slots": { const times = (p.schedule && p.schedule.times && p.schedule.times.length) ? p.schedule.times : ["--:--"];
      const slots = times.map(tm => { const l = logs.find(x => x.data.slot === tm) || null; return { time: tm, log: l, taken: l ? !!l.data.taken : null }; });
      return { mode, slots, done: slots.every(s => s.log), taken: slots.filter(s => s.taken).length, expected: slots.length }; }
    default: return { mode: "check", done: logs.length > 0, log: logs[0] || null };
  }
}
// 按周算目标的（每周 3 次锻炼）：这一周做了几次、多少分钟
function weekOf(p, day = today(), logs = S.wb.logs){
  const a = weekStartOf(day), b = dayAdd(a, 7), tg = p.target || {};
  const ls = logs.filter(l => l.practice_id === p.id && l.day >= a && l.day < b);
  const minutes = ls.reduce((s, l) => s + (+l.data.minutes || 0), 0);
  return { sessions: ls.length, minutes, count: tg.count || 0, minutesGoal: (tg.minutes || 0) * (tg.count || 1), start: a };
}
// 连续天数：从今天（今天没做就从昨天）往回数，只数排了的日子；没排的日子跳过不算断
function streak(p){
  let d = today(), n = 0, guard = 0;
  if (scheduledOn(p, d) && !statusOf(p, d).done) d = dayAdd(d, -1);
  while (guard++ < 400) {
    if (scheduledOn(p, d)) { if (!statusOf(p, d).done) break; n++; }
    d = dayAdd(d, -1);
    if (d < dayAdd(today(), -HISTORY_DAYS)) break;
  }
  return n;
}
const stamp = p => (p.share === "family" && S.family) ? { family_id: S.family.id, share: "family" } : { family_id: null, share: "private" };
async function upsertPractice(f){
  const old = f.id ? practice(f.id) : null;
  const row = { user_id: me(), id: f.id || newId(), kind: f.kind || "custom", name: f.name || "", icon: f.icon || "", target: f.target || {}, schedule: f.schedule || {}, meta: f.meta || {},
    share: f.share === "family" ? "family" : "private", sort: f.sort ?? (old ? old.sort : S.wb.practices.length), active: f.active !== false, archived: !!f.archived, updated_at: nowIso() };
  Object.assign(row, stamp(row));
  const data = await run(SB.client.from("wb_practices").upsert(row).select().single());
  put(S.wb.practices, data);
  if (old && (old.share !== data.share || old.family_id !== data.family_id)) {
    // 这项的打卡记录跟着改可见性
    await run(SB.client.from("wb_logs").update({ family_id: data.family_id, share: data.share }).eq("user_id", me()).eq("practice_id", data.id));
    S.wb.logs.forEach(l => { if (l.practice_id === data.id) { l.family_id = data.family_id; l.share = data.share; } });
  }
  return data;
}
async function deletePractice(id){
  await run(SB.client.from("wb_practices").delete().eq("user_id", me()).eq("id", id));
  S.wb.practices = S.wb.practices.filter(p => p.id !== id); S.wb.logs = S.wb.logs.filter(l => l.practice_id !== id);
}
async function applyTemplate(){
  const have = new Set(S.wb.practices.map(p => p.kind)); let n = 0;
  for (const tpl of TEMPLATE) { if (have.has(tpl.kind)) continue; await upsertPractice({ ...tpl, share: "private" }); n++; }
  return n;
}

/* ---- 打卡记录 ---- */
async function addLog(kind, pid, data = {}, day = today()){
  const p = pid ? practice(pid) : null;
  const row = { user_id: me(), id: newId(), practice_id: p ? p.id : null, kind, day, ts: Date.now(), data, updated_at: nowIso(), ...(p ? stamp(p) : { family_id: null, share: "private" }) };
  const d = await run(SB.client.from("wb_logs").insert(row).select().single()); S.wb.logs.push(d); return d;
}
async function updateLog(id, data){
  const l = S.wb.logs.find(x => x.id === id); if (!l) return null;
  const d = await run(SB.client.from("wb_logs").update({ data: { ...l.data, ...data }, updated_at: nowIso() }).eq("user_id", me()).eq("id", id).select().single());
  return put(S.wb.logs, d);
}
async function deleteLog(id){ await run(SB.client.from("wb_logs").delete().eq("user_id", me()).eq("id", id)); S.wb.logs = S.wb.logs.filter(x => x.id !== id); }
// 一天一个数（屏幕、睡眠、饮食评价）：有就改，没有就加
async function setDaily(p, data, day = today()){ const l = logsFor(p.id, day)[0]; return l ? updateLog(l.id, data) : addLog(p.kind, p.id, data, day); }
async function toggleCheck(p, day = today()){ const l = logsFor(p.id, day)[0]; if (l) { await deleteLog(l.id); return false; } await addLog(p.kind, p.id, {}, day); return true; }
async function setSlot(p, slot, taken, day = today()){
  const l = logsFor(p.id, day).find(x => x.data.slot === slot) || null;
  if (taken == null) { if (l) await deleteLog(l.id); } else if (l) await updateLog(l.id, { taken }); else await addLog(p.kind, p.id, { slot, taken }, day);
  // 库存：服了减一，撤销加回；跳过不动
  if (p.meta && p.meta.stock != null && p.meta.stock !== "") {
    const was = l ? !!l.data.taken : false, now = !!taken, delta = (was ? 1 : 0) - (now ? 1 : 0);
    if (delta) await upsertPractice({ ...p, meta: { ...p.meta, stock: Math.max(0, (+p.meta.stock || 0) + delta) } });
  }
}

/* ---- 祷告清单（永远只有自己） ---- */
const prayerOf = id => S.wb.prayers.find(p => p.id === id) || null;
async function upsertPrayer(f){
  const row = { user_id: me(), id: f.id || newId(), text: f.text || "", category: f.category || "family", status: f.status || "open", answered_on: f.answered_on || null, answer: f.answer || "",
    times: f.times || 0, last_prayed: f.last_prayed || null, sort: f.sort ?? S.wb.prayers.length, updated_at: nowIso() };
  const d = await run(SB.client.from("wb_prayers").upsert(row).select().single()); return put(S.wb.prayers, d);
}
async function prayed(id){ const p = prayerOf(id); if (p) await upsertPrayer({ ...p, times: (p.times || 0) + 1, last_prayed: today() }); }
async function answerPrayer(id, answer){ const p = prayerOf(id); if (p) await upsertPrayer({ ...p, status: "answered", answered_on: today(), answer: answer || "" }); }
async function reopenPrayer(id){ const p = prayerOf(id); if (p) await upsertPrayer({ ...p, status: "open", answered_on: null, answer: "" }); }
async function deletePrayer(id){ await run(SB.client.from("wb_prayers").delete().eq("user_id", me()).eq("id", id)); S.wb.prayers = S.wb.prayers.filter(p => p.id !== id); }

/* ---- 个人设置 ---- */
const settings = () => (S.wb.profile && S.wb.profile.settings) || {};
async function saveSettings(patch){
  const next = { ...settings(), ...patch };
  const d = await run(SB.client.from("wb_profile").update({ settings: next }).eq("user_id", me()).select().single());
  S.wb.profile = d; return d;
}
function randomToken(){ const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function resetIcsToken(){ const d = await run(SB.client.from("wb_profile").update({ ics_token: randomToken() }).eq("user_id", me()).select().single()); S.wb.profile = d; return d; }

/* ---- 读经计划 ---- */
function planState(){ const s = settings().plan || {}; return { id: s.id || null, progress: s.progress || {}, custom: s.custom || null }; }
function currentPlan(){
  const st = planState(); if (!st.id) return null;
  if (st.id === "custom") return st.custom && st.custom.items && st.custom.items.length ? { id: "custom", name: st.custom.name || t("自定义计划"), desc: "", items: st.custom.items } : null;
  return planById(st.id);
}
function todayPassage(){
  const plan = currentPlan(); if (!plan) return null;
  const n = planState().progress[plan.id] || 0, index = n % plan.items.length;
  return { plan, item: plan.items[index], index, total: plan.items.length, round: Math.floor(n / plan.items.length) };
}
async function choosePlan(id){ await saveSettings({ plan: { ...planState(), id } }); }
async function movePlan(delta){ const plan = currentPlan(); if (!plan) return; const st = planState(); await saveSettings({ plan: { ...st, progress: { ...st.progress, [plan.id]: Math.max(0, (st.progress[plan.id] || 0) + delta) } } }); }
async function setPlanIndex(i){ const plan = currentPlan(); if (!plan) return; const st = planState(); await saveSettings({ plan: { ...st, progress: { ...st.progress, [plan.id]: Math.max(0, Math.min(plan.items.length - 1, i)) } } }); }
async function importPlan(name, items){ await saveSettings({ plan: { ...planState(), id: "custom", custom: { name, items } } }); }
// 今天的读经记录：按计划读完 → 记一条并前进一格；撤销 → 删记录并退一格
const readingLog = (day = today()) => logsOfKind("scripture", day).find(l => l.data && l.data.plan != null) || null;
async function markRead(tp){
  const p = firstOfKind("scripture");
  await addLog("scripture", p ? p.id : null, { ref: tp.item.label, plan: tp.plan.id, index: tp.index }, today());
  await movePlan(1);
}
async function unmarkRead(){
  const l = readingLog(); if (!l) return;
  const plan = currentPlan();
  await deleteLog(l.id);
  if (plan && l.data.plan === plan.id) await movePlan(-1);
}
async function logReading(ref, note){ const p = firstOfKind("scripture"); await addLog("scripture", p ? p.id : null, { ref, note: note || "" }, today()); }

// 段落正文：按章抓取，缓存在内存里。返回 [{ title, verses: [{v, text}] }]，失败的章带 error
async function passageText(item, version){
  const chapters = [];
  for (const part of item.parts || []) for (let c = part.c1; c <= part.c2; c++) chapters.push({ n: part.n, c });
  // 几章一起抓（每章约 1 秒），不要一章等一章
  await Promise.all(chapters.map(async ({ n, c }) => {
    const key = `${version}/${n}/${c}`; if (S.wb.texts[key]) return;
    try { S.wb.texts[key] = { verses: await fetchChapter(n, c, version) }; } catch (e) { S.wb.texts[key] = { error: e.message || String(e) }; }
  }));
  return chapters.map(({ n, c }) => ({ title: `${bookZh(n)} ${c}`, ...S.wb.texts[`${version}/${n}/${c}`] }));
}

/* ---- 家人开给我看的（只读） ---- */
function familyToday(day = today()){
  const by = {};
  for (const p of S.wb.fam.practices.filter(p => p.active !== false && !p.archived)) {
    if (!scheduledOn(p, day)) continue;
    const logs = S.wb.fam.logs.filter(l => l.practice_id === p.id && l.day === day);
    (by[p.user_id] = by[p.user_id] || []).push({ p, st: statusOf(p, day, logs), week: p.target && p.target.per === "week" ? weekOf(p, day, S.wb.fam.logs) : null });
  }
  return Object.entries(by).map(([uid, items]) => ({ uid, name: memberName(uid), items }));
}

export { HISTORY_DAYS, today, dayAdd, weekday, weekStartOf, loadAll, attachRealtime, settings, saveSettings, resetIcsToken,
  practice, activePractices, scheduledOn, forDay, logsFor, logsOfKind, firstOfKind, statusOf, weekOf, streak, upsertPractice, deletePractice, applyTemplate,
  addLog, updateLog, deleteLog, setDaily, toggleCheck, setSlot,
  prayerOf, upsertPrayer, prayed, answerPrayer, reopenPrayer, deletePrayer,
  planState, currentPlan, todayPassage, choosePlan, movePlan, setPlanIndex, importPlan, readingLog, markRead, unmarkRead, logReading, passageText, familyToday };
