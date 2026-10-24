import { SB } from "./core/auth.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { newId, toast } from "./core/util.js";
import { byNewest, parseTags } from "./notes-lib.js";
import * as wb from "./wb.js";

/* ============ 灵修笔记数据层（在线优先）============
   wb_notes 表由 docs/016_shepherd_notes.sql 建立；表不存在时 S.nt.error = "missing"，只有笔记页提示，其余照常。
   mine = 自己的笔记；shared = 家人分享给我的（只读，shared_with 里有我）。
   默认只有自己看得到；shared_with 里列出的家人只读。拍照识字的原图不保存，只存选定的文字。 */
S.nt = { loaded: false, error: null, mine: [], shared: [] };

const me = () => S.user.id;
const missingTable = err => err && (err.code === "42P01" || err.code === "PGRST205" || /schema cache|does not exist/i.test(err.message || ""));
async function run(p, msg){ const { data, error } = await p; if (error) { console.error(error); toast(t(msg || "云端保存失败") + (error.message ? "：" + String(error.message).slice(0, 80) : "")); throw error; } return data; }
const put = (list, row) => { const i = list.findIndex(x => x.id === row.id && x.user_id === row.user_id); if (i >= 0) list[i] = row; else list.push(row); return row; };
const note = id => S.nt.mine.find(x => x.id === id) || S.nt.shared.find(x => x.id === id) || null;
const isMine = n => n.user_id === me();

async function loadNotes(){
  S.nt.loaded = false; S.nt.error = null;
  const mine = await SB.client.from("wb_notes").select("*").eq("user_id", me()).order("day", { ascending: false }).limit(5000);
  if (mine.error) { console.error(mine.error); S.nt.error = missingTable(mine.error) ? "missing" : "error"; return; }
  S.nt.mine = (mine.data || []).sort(byNewest); S.nt.shared = [];
  if (S.family) {
    const sh = await SB.client.from("wb_notes").select("*").eq("family_id", S.family.id).contains("shared_with", [me()]).neq("user_id", me()).order("day", { ascending: false }).limit(1000);
    if (!sh.error) S.nt.shared = (sh.data || []).sort(byNewest);
  }
  S.nt.loaded = true;
}
function attachRealtime(ch, onChange){
  const apply = (list, p) => {
    if (p.eventType === "DELETE") { const o = p.old || {}; const i = list.findIndex(x => x.id === o.id && (!o.user_id || x.user_id === o.user_id)); if (i >= 0) list.splice(i, 1); }
    else if (p.new && p.new.id) put(list, p.new);
    list.sort(byNewest);
  };
  ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_notes", filter: "user_id=eq." + me() }, p => { apply(S.nt.mine, p); onChange(); });
  if (S.family) ch.on("postgres_changes", { event: "*", schema: "public", table: "wb_notes", filter: "family_id=eq." + S.family.id }, p => {
    const row = p.new || p.old || {}; if (row.user_id === me()) return;
    const sharedToMe = p.eventType === "DELETE" || (p.new && (p.new.shared_with || []).includes(me()));
    if (sharedToMe) apply(S.nt.shared, p); else if (p.new) S.nt.shared = S.nt.shared.filter(x => x.id !== p.new.id);   // 取消分享：从我这里消失
    onChange();
  });
}

/** 新增或修改自己的一条。f: { id?, kind, day, ref, source, quote, reflection, tags(数组或字符串), ai_used, shared_with } */
async function saveNote(f){
  const old = f.id ? S.nt.mine.find(x => x.id === f.id) : null;
  const ids = (f.shared_with || []).filter(u => u !== me() && S.members[u]);
  const row = { user_id: me(), id: f.id || newId(), kind: f.kind || "reading", day: f.day || S.day, ref: String(f.ref || "").trim(), source: String(f.source || "").trim(),
    quote: String(f.quote || "").trim(), reflection: String(f.reflection || "").trim(), tags: Array.isArray(f.tags) ? f.tags : parseTags(f.tags), ai_used: !!f.ai_used,
    shared_with: S.family ? ids : [], family_id: S.family && ids.length ? S.family.id : null, ...(old ? {} : { created_at: new Date().toISOString() }) };
  const d = await run(SB.client.from("wb_notes").upsert(row).select().single());
  put(S.nt.mine, d); S.nt.mine.sort(byNewest);
  return d;
}
async function deleteNote(id){ await run(SB.client.from("wb_notes").delete().eq("user_id", me()).eq("id", id)); S.nt.mine = S.nt.mine.filter(x => x.id !== id); }

export { loadNotes, attachRealtime, note, isMine, saveNote, deleteNote, missingTable };
