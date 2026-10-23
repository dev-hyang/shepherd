import { SB } from "./core/auth.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { newId, toast } from "./core/util.js";
import { DEFAULT_CATS, KIND_CAT } from "./data/taskcats.js";
import { addDays, diffDays, expand, nextDue, periodEnd, periodStart } from "./recur.js";
import * as wb from "./wb.js";

/* ============ 任务数据层（在线优先）============
   wb_tasks 表由 docs/015_shepherd_tasks.sql 建立；表不存在时 S.tk.error = "missing"，只有任务页签提示，其余照常。
   完成记录不另建表：写 wb_logs（kind = 'task'，data 带 task_id / 标题 / 分类 / 当次到期日），回顾和报表直接用。
   重复任务是一条主记录：完成 = 记一条日志 + 把 due 推到下一次；计划视图用 recur.expand 把未来几次展开显示。 */
S.tk = { loaded: false, error: null, items: [], fam: [] };

const me = () => S.user.id;
const missingTable = err => err && (err.code === "42P01" || err.code === "PGRST205" || /schema cache|does not exist/i.test(err.message || ""));
async function run(p, msg){ const { data, error } = await p; if (error) { console.error(error); toast(t(msg || "云端保存失败") + (error.message ? "：" + String(error.message).slice(0, 80) : "")); throw error; } return data; }
const put = (list, row) => { const i = list.findIndex(x => x.id === row.id && x.user_id === row.user_id); if (i >= 0) list[i] = row; else list.push(row); return row; };
const task = id => S.tk.items.find(x => x.id === id) || null;
const nowIso = () => new Date().toISOString();
// 补记那天的完成时间：记成那天中午；今天就是现在
const tsFor = day => (day === S.day ? nowIso() : new Date(day + "T12:00:00").toISOString());

async function loadTasks(){
  S.tk.loaded = false; S.tk.error = null;
  const open = await SB.client.from("wb_tasks").select("*").eq("user_id", me()).eq("status", "open");
  if (open.error) { console.error(open.error); S.tk.error = missingTable(open.error) ? "missing" : "error"; return; }
  const closed = await SB.client.from("wb_tasks").select("*").eq("user_id", me()).neq("status", "open").gte("done_at", new Date(Date.now() - wb.HISTORY_DAYS * 864e5).toISOString());
  S.tk.items = [...(open.data || []), ...(closed.data || [])];
  S.tk.fam = [];
  if (S.family) {
    const fr = await SB.client.from("wb_tasks").select("*").eq("family_id", S.family.id).eq("share", "family").neq("user_id", me()).eq("status", "open").gte("due", addDays(S.day, -1));
    if (!fr.error) S.tk.fam = fr.data || [];
  }
  S.tk.loaded = true;
}
function attachRealtime(ch, onChange){
  ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_tasks", filter: "user_id=eq." + me() }, p => {
    if (p.eventType === "DELETE") { const o = p.old || {}; S.tk.items = S.tk.items.filter(x => x.id !== o.id); }
    else if (p.new && p.new.id) put(S.tk.items, p.new);
    onChange();
  });
}

/* ---- 分类（内置 + 自己改的）---- */
const cats = () => { const own = wb.settings().taskCats; return Array.isArray(own) && own.length ? own : DEFAULT_CATS; };
const catOf = id => cats().find(c => c.id === id) || cats().find(c => c.id === "inbox") || DEFAULT_CATS[0];
const subOf = (cid, sid) => (catOf(cid).subs || []).find(s => s.id === sid) || null;
const catName = c => (DEFAULT_CATS.some(d => d.id === c.id && d.name === c.name) ? t(c.name) : c.name);   // 内置名走翻译，自己改的名字原样
const subName = (c, s) => (DEFAULT_CATS.some(d => d.id === c.id && (d.subs || []).some(x => x.id === s.id && x.name === s.name)) ? t(s.name) : s.name);
const catLabel = tk => { const c = catOf(tk.cat), s = tk.sub && subOf(tk.cat, tk.sub); return `${catName(c)}${s ? ` / ${subName(c, s)}` : ""}`; };
async function saveCats(list){ await wb.saveSettings({ taskCats: list }); }

/* ---- 催办设置 ---- */
const NUDGE_DEFAULT = { bar: true, escalate: true, evening: true, eveningAt: "21:00", capacityH: 6, remind: [0], allDayAt: "09:00" };
const nudge = () => ({ ...NUDGE_DEFAULT, ...(wb.settings().nudge || {}) });
async function saveNudge(patch){ await wb.saveSettings({ nudge: { ...nudge(), ...patch } }); }

/* ---- 读 ---- */
const open = () => S.tk.items.filter(x => x.status === "open");
const overdueDays = (tk, day = S.day) => (tk.status === "open" && tk.due && tk.due < day ? diffDays(tk.due, day) : 0);
const overdue = (day = S.day) => open().filter(x => overdueDays(x, day) > 0).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
const timeKey = tk => tk.start_time || "99:99";
const byTime = (a, b) => timeKey(a).localeCompare(timeKey(b)) || (b.prio || 0) - (a.prio || 0) || (a.sort || 0) - (b.sort || 0);
/** 某一天排在这天的任务（含展开的重复；period = day）。带 virtual 的是未来几次的展开，不能直接勾 */
function onDay(day){
  const out = [];
  for (const tk of open()) {
    if ((tk.period || "day") !== "day" || !tk.due) continue;
    if (tk.due === day) out.push(tk);
    else if (tk.recur && !tk.recur.after && tk.due < day && expand(tk, day, day).length) out.push({ ...tk, virtual: true, due: day });
  }
  return out.sort(byTime);
}
/** 某天所在周期里“不指定哪天”的任务（本周 / 本月 / 本季度 / 本年度要做） */
function periodTasks(period, day){
  return open().filter(x => x.period === period && x.due && periodStart(period, x.due) <= day && day <= x.due).sort(byTime);
}
const inbox = () => open().filter(x => !x.due).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
/** 今天页的数：逾期 + 今天到期的未完成 */
const pendingCount = () => overdue().length + onDay(S.day).filter(x => !x.virtual).length;
/** 今天有具体时间、还没做的下一件（催办条用） */
function nextTimed(now = new Date()){
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return onDay(S.day).filter(x => !x.virtual && x.start_time && x.start_time >= hm).sort(byTime)[0] || null;
}
const doneLogs = () => S.wb.logs.filter(l => l.kind === "task").sort((a, b) => (b.ts || 0) - (a.ts || 0));

/* ---- 写 ---- */
async function patch(id, fields){
  const d = await run(SB.client.from("wb_tasks").update(fields).eq("user_id", me()).eq("id", id).select().single());
  return put(S.tk.items, d);
}
function rowOf(f, old){
  const share = f.share === "family" && S.family ? "family" : "private";
  return { user_id: me(), id: f.id || newId(), title: String(f.title || "").trim(), note: f.note || "", kind: f.kind === "event" ? "event" : "task",
    cat: f.cat || "inbox", sub: f.sub || "", period: f.period || "day", due: f.due || null, start_time: f.start_time || null, dur: f.dur ? Math.round(+f.dur) : null,
    recur: f.recur || null, prio: Math.max(0, Math.min(3, +f.prio || 0)), remind: Array.isArray(f.remind) ? f.remind : [], nag: !!f.nag,
    subtasks: Array.isArray(f.subtasks) ? f.subtasks : [], status: old ? old.status : "open", done_at: old ? old.done_at : null, slips: old ? old.slips : 0,
    practice_id: f.practice_id || null, with_ids: [], share, share_mode: "detail", family_id: share === "family" ? S.family.id : null, sort: old ? old.sort : Date.now() % 1e9 };
}
async function saveTask(f){
  const old = f.id ? task(f.id) : null, row = rowOf(f, old);
  if (!row.title) { toast(t("请填标题")); return null; }
  if (row.kind === "event" && !row.start_time) row.kind = "task";   // 事件必须有开始时间
  return put(S.tk.items, await run(SB.client.from("wb_tasks").upsert(row).select().single()));
}
/** 完成（day = 算在哪一天，补记时是过去的某天）。重复任务记一条日志并推到下一次；返回 { next } 或 null */
async function complete(id, day = wb.today()){
  const tk = task(id); if (!tk || tk.status !== "open") return null;
  await wb.addLog("task", null, { task_id: tk.id, title: tk.title, cat: tk.cat, sub: tk.sub, due: tk.due, prio: tk.prio, slips: tk.slips, minutes: tk.dur || null }, day);
  const next = tk.recur ? nextDue(tk, day) : null;
  if (next) { await patch(id, { due: next, slips: 0, subtasks: (tk.subtasks || []).map(s => ({ ...s, done: false })) }); return { next }; }
  await patch(id, { status: "done", done_at: tsFor(day) });
  return null;
}
/** 撤销一条完成记录：单次任务重新打开；重复任务把 due 退回那次 */
async function undoLog(logId){
  const l = S.wb.logs.find(x => x.id === logId); if (!l) return;
  const tk = task(l.data && l.data.task_id);
  if (tk) {
    if (tk.status === "done") await patch(tk.id, { status: "open", done_at: null });
    else if (tk.recur && l.data.due) await patch(tk.id, { due: l.data.due });
  }
  await wb.deleteLog(logId);
}
/** 放弃：单次任务标记放弃（不算失败）；重复任务只跳过这一次 */
async function drop(id){
  const tk = task(id); if (!tk) return;
  const next = tk.recur ? nextDue(tk, S.day) : null;
  if (next) await patch(id, { due: next, slips: 0 }); else await patch(id, { status: "dropped", done_at: nowIso() });
}
async function reopen(id){ await patch(id, { status: "open", done_at: null }); }
/** 顺延：不给日期就顺延一个单位（某天任务到明天 / 之后一天，周月季年任务到下一个周期）；次数 +1，催办用 */
async function postpone(id, to){
  const tk = task(id); if (!tk) return null;
  const period = tk.period || "day";
  if (!to) to = period === "day" ? addDays(tk.due && tk.due > S.day ? tk.due : S.day, 1) : periodEnd(period, addDays(tk.due || S.day, 1));
  await patch(id, { due: to, slips: (tk.slips || 0) + 1 });
  return to;
}
async function remove(id){ await run(SB.client.from("wb_tasks").delete().eq("user_id", me()).eq("id", id)); S.tk.items = S.tk.items.filter(x => x.id !== id); }
async function toggleSub(id, i){ const tk = task(id); if (!tk || !tk.subtasks[i]) return; const subs = tk.subtasks.map((s, j) => (j === i ? { ...s, done: !s.done } : s)); await patch(id, { subtasks: subs }); }
/** 快速添加：一句话解析后存；认不出日期的进收件箱（due 为空）*/
async function quickAdd(text, day){ const { parseQuick } = await import("./recur.js"); const q = parseQuick(text, S.day, cats()); if (!q.title) { toast(t("请填标题")); return null; }
  const hasDue = q.due || q.start_time; const due = q.due || (q.start_time ? day : null);
  return saveTask({ title: q.title, due: hasDue ? due : null, period: q.period || "day", start_time: q.start_time, dur: q.dur, prio: q.prio, cat: q.cat || "inbox", sub: q.sub || "", remind: q.start_time ? nudge().remind : [] }); }

/* ---- 今日三件大事（存在个人设置里：{ day, ids }）---- */
const MIT_MAX = 3;
function mit(){ const m = wb.settings().mit; return m && m.day === S.day ? m.ids.map(task).filter(x => x && x.status === "open" || (x && x.status !== "open" && x.done_at && x.done_at.slice(0, 10) === S.day)) : []; }
const mitIds = () => { const m = wb.settings().mit; return m && m.day === S.day ? m.ids : []; };
async function setMit(ids){ await wb.saveSettings({ mit: { day: S.day, ids: ids.slice(0, MIT_MAX) } }); }
/** 可选作大事的候选：逾期、今天到期、高优先级 */
const mitCandidates = () => [...new Map([...overdue(), ...onDay(S.day).filter(x => !x.virtual), ...open().filter(x => x.prio === 3)].map(x => [x.id, x])).values()];

/** 习惯种类对应的大类（报表里用）*/
const habitCat = p => KIND_CAT[p && p.kind] || "self";

export { loadTasks, attachRealtime, task, cats, catOf, subOf, catName, subName, catLabel, saveCats, nudge, saveNudge, NUDGE_DEFAULT, open, overdue, overdueDays, onDay, periodTasks, inbox, pendingCount, nextTimed, doneLogs,
  saveTask, complete, undoLog, drop, reopen, postpone, remove, toggleSub, quickAdd, mit, mitIds, setMit, mitCandidates, MIT_MAX, habitCat, byTime };
