import { SB } from "./core/auth.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { debounce, newId, readPaged, toast } from "./core/util.js";
import { cursorArgs, effMonth, noteArgs, pageSlice, parseTags, statsArgs } from "./notes-lib.js";
import * as pg from "./pager.js";

/* ============ 灵修笔记数据层（在线优先，服务器端分页）============
   wb_notes 表由 baby-log/supabase/migrations/016_shepherd_notes.sql 建立；分页、筛选、统计的函数由 025_shepherd_notes_paging.sql 建立。
   表或函数不存在时 S.nt.error = "missing"，只有笔记页提示，其余照常。
   不再把全部笔记读进内存：
     rows   —— 笔记页当前筛选下已经读到的几页（wb_notes_page，键集分页，每次“继续加载”再读一页）
     stats  —— wb_notes_stats 一次算好的统计：条数、各类型 / 标签 / 月份、筛选命中数、最近一条、历史上的今天
   换筛选、保存 / 删除、实时通知：统计 + 第一页一起重读（两个请求同时发）。导出要的全部笔记在打开导出时现读（fetchAll）。
   mine = 自己的笔记；shared = 家人分享给我的（只读，shared_with 里有我）。拍照识字的原图不保存，只存选定的文字。 */
S.nt = { loaded: false, error: null, stats: null, rows: [], hasNext: false, busy: false, args: null };

const me = () => S.user.id;
/** 表没建（016）或函数没建（025）：PostgREST 找不到函数是 PGRST202，数据库里是 42883 */
const missingTable = err => err && (["42P01", "PGRST205", "PGRST202", "42883"].includes(err.code) || /schema cache|does not exist|could not find the function/i.test(err.message || ""));
async function run(p, msg){ const { data, error } = await p; if (error) { console.error(error); toast(t(msg || "云端保存失败") + (error.message ? "：" + String(error.message).slice(0, 80) : "")); throw error; } return data; }
const same = (a, b) => a && b && a.id === b.id && a.user_id === b.user_id;
/** 按 id 找一条：当前列表、最近一条、历史上的今天里都找（我的优先） */
function note(id){
  const st = S.nt.stats || {}, pool = [...S.nt.rows, ...(st.latest ? [st.latest] : []), ...(st.otd || [])];
  return pool.find(x => x.id === id && x.user_id === me()) || pool.find(x => x.id === id) || null;
}
const isMine = n => n.user_id === me();
const curArgs = () => noteArgs(S.ntUi || {}, { family: S.family ? S.family.id : null });

let gen = 0;   // 每次重读加一：慢的旧请求回来时如果已经换了筛选，就丢掉
/** 统计 + 第一页（同时发）。keep = true 时把已经展开的几页一起重读（实时通知用，免得“继续加载”过的又缩回第一页） */
async function refresh({ keep = false } = {}){
  const my = ++gen, size = pg.pageSize(), n = keep ? Math.min(Math.max(size, S.nt.rows.length), 1000) : size;
  let args = curArgs();
  S.nt.busy = true;
  const [st, pgr] = await Promise.all([
    SB.client.rpc("wb_notes_stats", statsArgs(args, S.day)),
    SB.client.rpc("wb_notes_page", { ...args, ...cursorArgs(null), p_limit: n + 1 })
  ]);
  if (my !== gen) return false;
  const err = st.error || pgr.error;
  if (err) {
    console.error(err); S.nt.busy = false;
    if (S.nt.loaded && !missingTable(err)) { toast(t("读取笔记失败，请刷新重试。")); return false; }   // 已经有数据：偶尔一次失败只提示，不清空页面
    S.nt.error = missingTable(err) ? "missing" : "error"; return false;
  }
  let page = pgr.data || [];
  // 选过的月份已经没有笔记了（删掉 / 改了日期）：回到最新的月，再读一次第一页
  const ui = S.ntUi || {};
  if (args.p_month && args.p_month !== "latest" && effMonth(ui, st.data.months || []) !== args.p_month) {
    ui.month = null; args = curArgs();
    const r = await SB.client.rpc("wb_notes_page", { ...args, ...cursorArgs(null), p_limit: n + 1 });
    if (my !== gen) return false;
    if (r.error) { console.error(r.error); S.nt.busy = false; S.nt.error = "error"; return false; }
    page = r.data || [];
  }
  const sl = pageSlice(page, n);
  Object.assign(S.nt, { stats: st.data, rows: sl.rows, hasNext: sl.hasNext, args, busy: false, error: null, loaded: true });
  return true;
}
/** 启动 / 切回前台：读统计 + 当前筛选的第一页（今天页和笔记页都够用了），不再读全部笔记 */
async function loadNotes(){
  S.nt.loaded = false; S.nt.error = null; S.nt.rows = []; S.nt.stats = null;
  await refresh();
}
/** 继续加载：从上一页最后一行之后再读一页 */
async function more(){
  if (!S.nt.hasNext || S.nt.busy || !S.nt.args) return false;
  const my = gen, size = pg.pageSize(), last = S.nt.rows[S.nt.rows.length - 1];
  S.nt.busy = true;
  const { data, error } = await SB.client.rpc("wb_notes_page", { ...S.nt.args, ...cursorArgs(last), p_limit: size + 1 });
  if (my !== gen) return false;   // 这期间换了筛选 / 重读过，结果作废
  S.nt.busy = false;
  if (error) { console.error(error); toast(t("读取笔记失败，请刷新重试。")); return false; }
  const sl = pageSlice(data, size);
  S.nt.rows = S.nt.rows.concat(sl.rows.filter(r => !S.nt.rows.some(x => same(x, r)))); S.nt.hasNext = sl.hasNext;
  return true;
}
/** 导出 / AI 整理用：现读“我的”笔记里符合 搜索 / 类型 / 标签 的全部（不分月），按 1000 行一页读完 */
async function fetchAll(){
  const a = { ...curArgs(), p_scope: "mine", p_family: null, p_month: null, ...cursorArgs(null), p_limit: null };
  const r = await readPaged(() => SB.client.rpc("wb_notes_page", a).order("day", { ascending: false }).order("created_at", { ascending: false }).order("user_id", { ascending: false }).order("id", { ascending: false }));
  if (r.error) { console.error(r.error); toast(t("读取笔记失败，请刷新重试。")); return null; }
  return r.data || [];
}
/** 实时：我的笔记或家里分享的笔记有变动 → 统计 + 已展开的几页重读（短时间内多条变动只读一次） */
function attachRealtime(ch, onChange){
  const reload = debounce(async () => { if (await refresh({ keep: true })) onChange(); }, 400);
  ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_notes", filter: "user_id=eq." + me() }, reload);
  if (S.family) ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_notes", filter: "family_id=eq." + S.family.id }, p => {
    const row = p.new || p.old || {}; if (row.user_id === me()) return;   // 自己的上面已经处理
    reload();
  });
}

/** 新增或修改自己的一条。f: { id?, kind, day, ref, source, quote, reflection, tags(数组或字符串), ai_used, shared_with }。
    保存后由调用方 refresh()（笔记页要先切到这条所在的月份再读） */
async function saveNote(f){
  const ids = (f.shared_with || []).filter(u => u !== me() && S.members[u]);
  const row = { user_id: me(), id: f.id || newId(), kind: f.kind || "reading", day: f.day || S.day, ref: String(f.ref || "").trim(), source: String(f.source || "").trim(),
    quote: String(f.quote || "").trim(), reflection: String(f.reflection || "").trim(), tags: Array.isArray(f.tags) ? f.tags : parseTags(f.tags), ai_used: !!f.ai_used,
    shared_with: S.family ? ids : [], family_id: S.family && ids.length ? S.family.id : null, ...(f.id ? {} : { created_at: new Date().toISOString() }) };
  return await run(SB.client.from("wb_notes").upsert(row).select().single());
}
async function deleteNote(id){ await run(SB.client.from("wb_notes").delete().eq("user_id", me()).eq("id", id)); await refresh({ keep: true }); }

export { loadNotes, refresh, more, fetchAll, attachRealtime, note, isMine, saveNote, deleteNote, missingTable };
