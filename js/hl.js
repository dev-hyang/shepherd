import { SB, memberName } from "./core/auth.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { readPaged, toast } from "./core/util.js";

/* ============ 家人健康 · 数据层（在线优先） ============
   表由 baby-log/supabase/migrations/026_shepherd_health.sql 建立；表不存在时 S.hl.error = "missing"，只有健康页提示，其余照常。
   家人之间全部可见（同一家庭的 active 成员读写这家人的健康记录；没家庭时只有自己）。family_id 由数据库的守卫触发器填。
   数据量小（一家人一年几十次就诊、几百条化验和测量）：登录后整批读进内存（readPaged，不被 1000 行截断），在内存里算走势和待办。
   孩子：列表读小月亮的 children 表（没有就读 families.settings.children），身高体重读 entries 里 type = 'baby' 的记录，只读。
   这里不和爱家小助手关联：那是另一个 Supabase 项目。 */
S.hl = { loaded: false, error: null, profiles: [], visits: [], labs: [], measures: [], kids: [], growth: {} };

const TABLES = { profiles: "hl_profiles", visits: "hl_visits", labs: "hl_labs", measures: "hl_measures" };
const me = () => S.user.id;
const missingTable = err => err && (err.code === "42P01" || err.code === "PGRST205" || /schema cache|does not exist/i.test(err.message || ""));
async function run(p, msg){ const { data, error } = await p; if (error) { console.error(error); toast(t(msg || "云端保存失败") + (error.message ? "：" + String(error.message).slice(0, 80) : "")); throw error; } return data; }
/** 这家人的行：family_id = 我的家庭，或者我自己记的（没家庭时、或者加入家庭前记的） */
const scope = q => (S.family ? q.or(`family_id.eq.${S.family.id},created_by.eq.${me()}`) : q.eq("created_by", me()));

async function loadHealth(){
  if (!S.user || S.user.is_anonymous) return;
  S.hl.error = null;
  const order = { profiles: "subject", visits: "day", labs: "day", measures: "day" };
  const res = await Promise.all(Object.entries(TABLES).map(([k, tb]) => readPaged(() => scope(SB.client.from(tb).select("*")).order(order[k]).order("id"))));
  const bad = res.find(r => r.error);
  if (bad) { console.error(bad.error); S.hl.error = missingTable(bad.error) ? "missing" : "error"; S.hl.loaded = false; return; }
  Object.keys(TABLES).forEach((k, i) => { S.hl[k] = res[i].data || []; });
  await loadKids();
  S.hl.loaded = true;
}
/** 小月亮的孩子和成长记录（只读）。读不到（没家庭 / 表没建）就没有孩子，不算错误 */
async function loadKids(){
  S.hl.kids = []; S.hl.growth = {};
  if (!S.family) return;
  const st = S.family.settings || {};
  let kids = [];
  const r = await SB.client.from("children").select("id, name, birth, sort").eq("family_id", S.family.id).order("sort").order("id");
  if (!r.error && r.data && r.data.length) kids = r.data.map(c => ({ id: c.id, name: c.name || "", birth: c.birth || "" }));
  else kids = (Array.isArray(st.children) ? st.children : []).filter(c => c && c.id && !c.archived).map(c => ({ id: c.id, name: c.name || "", birth: c.birth || "" }));
  S.hl.kids = kids;
  if (!kids.length) return;
  const legacy = st.legacyChild || kids[0].id;
  const g = await readPaged(() => SB.client.from("entries").select("id, ts, data").eq("family_id", S.family.id).eq("type", "baby").eq("deleted", false).order("ts").order("id"));
  if (g.error) { console.warn("[health] growth", g.error.message); return; }
  for (const e of g.data || []) {
    const d = e.data || {}, kg = +d.weight || null, cm = +d.length || null; if (!kg && !cm) continue;
    const cid = d.child && kids.some(k => k.id === d.child) ? d.child : legacy;
    const day = new Date(+e.ts).toISOString().slice(0, 10);
    (S.hl.growth[cid] ||= []).push({ day, weight_kg: kg, height_cm: cm });
  }
}

/* ---- 家里的人：我 → 其他大人 → 孩子 ---- */
function people(){
  const out = [];
  if (S.user) out.push({ key: "u:" + me(), name: memberName(me()), kid: false, me: true });
  for (const uid of Object.keys(S.members || {})) if (uid !== (S.user && S.user.id)) out.push({ key: "u:" + uid, name: memberName(uid), kid: false });
  for (const k of S.hl.kids) out.push({ key: "c:" + k.id, name: k.name || t("孩子"), kid: true, birth: k.birth });
  return out;
}
const person = key => people().find(p => p.key === key) || null;
const profileOf = key => S.hl.profiles.find(p => p.subject === key) || null;
/** 这个人的全部记录（给 health-lib 用） */
function dataOf(key){
  const kidId = key.startsWith("c:") ? key.slice(2) : null;
  return {
    visits: S.hl.visits.filter(x => x.subject === key), labs: S.hl.labs.filter(x => x.subject === key),
    measures: S.hl.measures.filter(x => x.subject === key), growth: kidId ? S.hl.growth[kidId] || [] : []
  };
}

/* ---- 写：成功后更新内存 ---- */
const put = (list, row) => { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.push(row); return row; };
async function save(kind, row){
  const tb = TABLES[kind], body = { ...row }; delete body.family_id; delete body.created_by; delete body.created_at; delete body.updated_at;
  const data = row.id ? await run(SB.client.from(tb).update(body).eq("id", row.id).select().single()) : await run(SB.client.from(tb).insert(body).select().single());
  return put(S.hl[kind], data);
}
async function saveMany(kind, rows){
  if (!rows.length) return [];
  const data = await run(SB.client.from(TABLES[kind]).insert(rows).select());
  for (const r of data || []) put(S.hl[kind], r);
  return data || [];
}
async function remove(kind, id){
  await run(SB.client.from(TABLES[kind]).delete().eq("id", id), "删除失败");
  S.hl[kind] = S.hl[kind].filter(x => x.id !== id);
  if (kind === "visits") S.hl.labs = S.hl.labs.map(x => (x.visit_id === id ? { ...x, visit_id: null } : x));   // 和数据库的 on delete set null 一致
}
async function saveProfile(key, data){
  const cur = profileOf(key);
  return save("profiles", cur ? { ...cur, data } : { subject: key, data });
}

/* ---- 实时：家人在别的设备上改了 ---- */
function attachRealtime(ch, onChange){
  for (const [k, tb] of Object.entries(TABLES)) ch.on("postgres_changes", { event: "*", schema: "public", table: tb }, payload => {
    if (payload.eventType === "DELETE") { const o = payload.old || {}; S.hl[k] = S.hl[k].filter(x => x.id !== o.id); }
    else if (payload.new && payload.new.id) put(S.hl[k], payload.new);
    onChange();
  });
}

export { loadHealth, people, person, profileOf, dataOf, save, saveMany, remove, saveProfile, attachRealtime };
