/* ============ 备份与恢复 ============
   把我自己在 wb_* 表里的全部数据（习惯、打卡、祷告、任务、笔记、档案）打成一个 JSON：手动下载；或按周 / 按月 / 自定义天数定时备份到
   云端（Supabase Storage 的 backups 桶，路径 user/<我的id>/…，baby-log 仓库迁移 017）、这台电脑的文件夹（File System Access，桌面 Chrome / Edge）、或下载。
   云端和文件夹只留 60 天。网页没法在关着时跑：到期后下次打开应用时在后台做一次。
   恢复：登录后选备份文件 → 预览 → 按表 upsert 回我的账号（同主键覆盖，其余新增）；换了账号也能导（user_id 一律换成现在的）。
   四个应用各有一份这个模块，CFG 不同（表、过滤列、云端前缀）。 */
import { SB, myName } from "./core/auth.js";
import { S } from "./core/state.js";
import { $, esc, toast, loadJSON, saveJSON } from "./core/util.js";
import { t } from "./core/i18n.js";
import { APP_VERSION, DROPBOX_APP_KEY, GOOGLE_API_KEY, GOOGLE_CLIENT_ID } from "./core/config.js";
import { createDrives } from "./cloud-drives.js";
import { head, showSheet } from "./sheet.js";
import { loadAll } from "./wb.js";
import { render } from "./views.js";

const CFG = {
  app: "shepherd", title: "牧羊人", key: "shepherd.backup",
  tables: ["wb_profile", "wb_practices", "wb_logs", "wb_prayers", "wb_tasks", "wb_notes"],   // 恢复顺序：被引用的在前（打卡引用习惯）
  extraTables: [],
  col: "user_id",
  ready: () => S.cloud === "ready" && !!S.user,
  scopeId: () => S.user.id,
  scopeName: () => myName() || "",
  prefix: () => `user/${S.user.id}`,
  remap: (row) => ({ ...row, user_id: S.user.id, ...("family_id" in row ? { family_id: S.family ? S.family.id : null } : {}) }),   // 全部归到现在登录的人；家庭可见的项挂到现在的家庭
  afterRestore: async () => { await loadAll(); render(); },
};
const KEEP_DAYS = 60, PAGE = 1000, FORMAT = 2;
/** 云盘：Google Drive / Dropbox / OneDrive / iCloud Drive 的电脑客户端都会在本机放一个同步文件夹，把备份写进去就等于上了那家云盘（网页没法直接调它们的 API：要各家注册 OAuth 应用，这里不做） */
const PROVIDERS = [
  { id: "any", name: "任意文件夹 / 其他云盘", hint: "电脑上的任何文件夹都行；用别家云盘就选它的同步文件夹" },
  { id: "gdrive", name: "Google Drive", hint: "装了 Google Drive 桌面版后，Windows 一般在「G:\\我的云端硬盘」或「Google Drive」盘，Mac 在 ~/Google Drive" },
  { id: "dropbox", name: "Dropbox", hint: "Windows 一般在 C:\\Users\\<你>\\Dropbox，Mac 在 ~/Dropbox" },
  { id: "onedrive", name: "OneDrive", hint: "Windows 一般在 C:\\Users\\<你>\\OneDrive，Mac 在 ~/OneDrive" },
  { id: "icloud", name: "iCloud Drive", hint: "Mac 在 ~/Library/Mobile Documents/com~apple~CloudDocs（访达侧栏的 iCloud 云盘）；Windows 装 iCloud 后在 C:\\Users\\<你>\\iCloudDrive" },
];
const FILE_RE = new RegExp(`^${CFG.app}-(\\d{4}-\\d{2}-\\d{2})-\\d{4}\\.json$`);

/* ---- 设置（存本机：文件夹本来就是这台电脑的） ---- */
const DEFAULTS = { every: "off", days: 14, targets: ["download"], provider: "any", gdPath: "", gdId: "", gdName: "", dbxPath: "", last: null, lastInfo: "" };
/* 四个应用共用的部分（同一域名下 localStorage 互通）：多久备份、备份到哪、云盘；各应用自己的：路径、上次备份时间 */
const SHARED_KEY = "homeworks.backup.shared", SHARED = ["every", "days", "targets", "provider"];
const localPart = () => { const o = loadJSON(CFG.key, {}); SHARED.forEach((k) => delete o[k]); return o; };
const settings = () => ({ ...DEFAULTS, ...loadJSON(SHARED_KEY, {}), ...localPart() });
const saveSettings = (patch) => {
  const sh = {}, loc = {}; for (const [k, v] of Object.entries(patch)) (SHARED.includes(k) ? sh : loc)[k] = v;
  if (Object.keys(sh).length) saveJSON(SHARED_KEY, { ...loadJSON(SHARED_KEY, {}), ...sh });
  if (Object.keys(loc).length) saveJSON(CFG.key, { ...localPart(), ...loc });
  return settings();
};
const intervalDays = (s = settings()) => (s.every === "week" ? 7 : s.every === "month" ? 30 : s.every === "custom" ? Math.max(1, +s.days || 14) : 0);
const nextDue = (s = settings()) => { const d = intervalDays(s); if (!d) return null; return s.last ? new Date(new Date(s.last).getTime() + d * 864e5) : new Date(); };
const isDue = (s = settings()) => { const n = nextDue(s); return !!n && n.getTime() <= Date.now(); };

/* ---- 打包 ---- */
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const fileName = () => `${CFG.app}-${stamp()}.json`;
async function readAll(table) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await SB.client.from(table).select("*").eq(CFG.col, CFG.scopeId()).range(from, from + PAGE - 1);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return out; throw new Error(`${table}: ${error.message}`); }   // 还没建的表：当作空
    out.push(...(data || [])); if (!data || data.length < PAGE) return out;
  }
}
async function collect() {
  const tables = {};
  for (const tb of [...CFG.tables, ...CFG.extraTables]) tables[tb] = await readAll(tb);
  return { app: CFG.app, format: FORMAT, app_version: APP_VERSION, exported_at: new Date().toISOString(), scope: { id: CFG.scopeId(), name: CFG.scopeName() }, exporter: S.user?.id || null, tables };
}
const rowCount = (d) => Object.values(d.tables || {}).reduce((a, r) => a + (r?.length || 0), 0);
const toBlob = (d) => new Blob([JSON.stringify(d)], { type: "application/json" });
function download(blob, name) { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---- 这台电脑的文件夹（File System Access API：桌面 Chrome / Edge；手机和 Safari 没有） ---- */
const folderSupported = () => typeof window.showDirectoryPicker === "function";
const IDB = "homeworks-fs";   // 四个应用共用一个文件夹（同一域名）
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore("h"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction("h").objectStore("h").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction("h", "readwrite"); if (v == null) tx.objectStore("h").delete(k); else tx.objectStore("h").put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { /* 忽略 */ } }
async function pickFolder() { const h = await window.showDirectoryPicker({ mode: "readwrite", id: `${CFG.app}-backup`, startIn: "documents" }); await idbSet("dir", h); return h; }
const forgetFolder = () => idbSet("dir", null);
async function folderStatus() {
  if (!folderSupported()) return { supported: false, name: "", perm: "none" };
  const h = await idbGet("dir"); if (!h) return { supported: true, name: "", perm: "none" };
  let perm = "prompt"; try { perm = await h.queryPermission({ mode: "readwrite" }); } catch (e) { /* 旧版 */ }
  return { supported: true, name: h.name, perm, handle: h };
}
async function writeFolder(blob, name, gesture) {
  const st = await folderStatus(); if (!st.handle) throw new Error("NO_FOLDER");
  if (st.perm !== "granted") { if (!gesture) throw new Error("NEED_GESTURE"); const p = await st.handle.requestPermission({ mode: "readwrite" }); if (p !== "granted") throw new Error("NEED_GESTURE"); }
  const fh = await st.handle.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close();
  const cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  try { for await (const [n] of st.handle.entries()) { const m = FILE_RE.exec(n); if (m && m[1] < cut) await st.handle.removeEntry(n).catch(() => {}); } } catch (e) { /* 忽略 */ }
  try { const n = await copySqlInto(st.handle, gesture); if (n) lastSqlCopied = n; } catch (e) { /* 拷不动 SQL 不影响备份本身 */ }
}

/* ---- 数据库脚本：supabase/ 目录在电脑上、不进 git，备份文件里也没有；选一次它的位置，每次写云盘文件夹时把 *.sql 一起拷进 sql/ 子目录 ---- */
async function pickSqlFolder() { const h = await window.showDirectoryPicker({ mode: "read", id: `${IDB}-sql`, startIn: "documents" }); await idbSet("sqldir", h); return h; }
const forgetSqlFolder = () => idbSet("sqldir", null);
async function sqlStatus() { const h = await idbGet("sqldir"); return h ? { name: h.name, handle: h } : { name: "" }; }
let lastSqlCopied = 0;
async function copySqlInto(dst, gesture) {
  const src = await idbGet("sqldir"); if (!src) return 0;
  let perm = "prompt"; try { perm = await src.queryPermission({ mode: "read" }); } catch (e) { /* 旧版 */ }
  if (perm !== "granted") { if (!gesture) return 0; if ((await src.requestPermission({ mode: "read" })) !== "granted") return 0; }
  const out = await dst.getDirectoryHandle("sql", { create: true }); let n = 0;
  const walk = async (dir, to) => { for await (const [name, h] of dir.entries()) {
    if (h.kind === "directory") { if (name.startsWith(".")) continue; await walk(h, await to.getDirectoryHandle(name, { create: true })); }
    else if (/\.(sql|md)$/i.test(name)) { const f = await h.getFile(), w = await (await to.getFileHandle(name, { create: true })).createWritable(); await w.write(await f.arrayBuffer()); await w.close(); n++; }
  } };
  await walk(src, out); return n;
}
/* ---- 云端（Supabase Storage backups 桶；迁移 017 建桶和权限） ---- */
const bucket = () => SB.client.storage.from("backups");
async function writeCloud(blob, name) {
  const { error } = await bucket().upload(`${CFG.prefix()}/${name}`, blob, { contentType: "application/json", upsert: true });
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? t("还没执行迁移 017（云端备份桶），先在 Supabase 里执行 baby-log 仓库的 supabase/migrations/017_backups.sql") : error.message);
  const cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const old = (await listCloud()).filter((f) => (FILE_RE.exec(f.name) || [])[1] < cut).map((f) => `${CFG.prefix()}/${f.name}`);
  if (old.length) await bucket().remove(old).catch(() => {});
}
async function listCloud() {
  if (!CFG.ready()) return [];
  const { data, error } = await bucket().list(CFG.prefix(), { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (error) return [];
  return (data || []).filter((f) => FILE_RE.test(f.name)).map((f) => ({ name: f.name, at: f.created_at || f.updated_at || "", size: f.metadata?.size || 0 }));
}
async function readCloud(name) { const { data, error } = await bucket().download(`${CFG.prefix()}/${name}`); if (error) throw new Error(error.message); return JSON.parse(await data.text()); }
const deleteCloud = (name) => bucket().remove([`${CFG.prefix()}/${name}`]);

/* ---- 云盘直连：Google Drive、Dropbox（代码在 cloud-drives.js，四个应用共用；要在 js/core/config.js 填应用 key，见 README「云盘备份」）
   备份放在你在卡片里填的文件夹路径下（Drive 默认「牧羊人备份」；Dropbox 相对应用文件夹），不往根目录随便放 ---- */
const DR = createDrives({ googleClientId: GOOGLE_CLIENT_ID, googleApiKey: GOOGLE_API_KEY, dropboxAppKey: DROPBOX_APP_KEY, tokPrefix: "homeworks.backup", legacyPrefixes: ["shepherd.backup"], defaultFolder: "牧羊人备份", fileRe: FILE_RE, keepDays: KEEP_DAYS, t, load: loadJSON, save: saveJSON, getPaths: () => { const s = settings(); return { gd: s.gdPath, gdId: s.gdId, gdName: s.gdName, dbx: s.dbxPath }; } });   // 令牌前缀四个应用相同：连一次全连上
/** 打开应用时调一次：从 Dropbox 授权页跳回来（?code=…&state=dbx）就换成令牌，勾上 Dropbox；登录好后打开备份页 */
async function initProviders() {
  if (!new URL(location.href).searchParams.get("code")) return;
  try { if (await DR.initProviders()) { saveSettings({ targets: [...new Set([...settings().targets, "dropbox"])] }); toast(t("已连接 Dropbox")); } }
  catch (e) { toast(t("连接 Dropbox 失败：{msg}", { msg: e.message })); }
  UI.stale = true; UI.pendingOpen = true;
}

/* ---- 跑一次备份 ---- */
const targetName = (k) => ({ download: t("下载"), folder: t("文件夹"), cloud: t("云端"), gdrive: "Google Drive", dropbox: "Dropbox" }[k] || k);
async function runBackup(targets, gesture = false) {
  const data = await collect(), blob = toBlob(data), name = fileName(), ok = [], failed = []; let needGesture = false;
  for (const tg of targets) {
    try {
      if (tg === "download") download(blob, name); else if (tg === "folder") await writeFolder(blob, name, gesture); else if (tg === "cloud") await writeCloud(blob, name);
      else if (tg === "gdrive") await DR.gdWrite(blob, name, gesture); else if (tg === "dropbox") await DR.dbxWrite(blob, name); else continue;
      ok.push(tg);
    } catch (e) { if (e.message === "NEED_GESTURE") needGesture = true; failed.push([tg, e.message === "NO_FOLDER" ? t("还没选文件夹") : e.message === "NEED_GESTURE" ? (tg === "gdrive" ? t("需要重新登录 Google") : t("需要你点一下授权")) : e.message]); }
  }
  const sqlN = lastSqlCopied; lastSqlCopied = 0;
  if (ok.length) saveSettings({ last: new Date().toISOString(), lastInfo: `${name} · ${ok.map(targetName).join("+")} · ${rowCount(data)} ${t("行")}${sqlN ? ` · ${t("SQL {n} 个", { n: sqlN })}` : ""}` });
  return { ok, failed, needGesture, name, rows: rowCount(data), sqlN };
}
let checked = false;
/** 进入家庭后调一次：到期了就在后台备份；文件夹要点一下授权的，提示去设置里点 */
async function runScheduled() {
  if (checked || !CFG.ready()) return; checked = true;
  if (UI.pendingOpen) { UI.pendingOpen = false; openBackup(); }   // 从 Dropbox 授权页跳回来：登录好了就打开备份页
  return;   // 定时备份由小月亮统一做（连同本应用的数据一起）；这里只手动
  // eslint-disable-next-line no-unreachable
  const s = settings(); if (!isDue(s) || !s.targets.length) return;
  try {
    const r = await runBackup(s.targets, false); S.backupPending = r.needGesture;
    if (r.ok.length) toast(t("已自动备份（{to}）", { to: r.ok.map(targetName).join("、") }));
    if (r.needGesture) toast(t("定时备份要写进文件夹，去 我的 → 备份与恢复 点一下「继续备份」"));
  } catch (e) { console.error(e); }
}

/* ---- 恢复 ---- */
/** 小月亮「连同一起备份」的文件：取出属于本应用的那一段 */
const unwrap = (d) => (d && d.app === "xiaoyueliang" && d.bundle?.[CFG.app]?.tables ? { app: CFG.app, format: FORMAT, exported_at: d.exported_at, scope: { id: null, name: d.family?.name || "" }, exporter: d.exporter, tables: d.bundle[CFG.app].tables, fromBundle: true } : d);
function inspect(d) {
  d = unwrap(d);
  if (!d || d.app !== CFG.app) return { ok: false, why: t("这不是{app}的备份文件", { app: t(CFG.title) }) };
  if (!d.tables) return { ok: false, why: t("文件里没有数据") };
  const counts = Object.fromEntries(Object.entries(d.tables).filter(([, v]) => v?.length).map(([k, v]) => [k, v.length]));
  return { ok: true, exported_at: d.exported_at, scope: d.scope?.name || "", counts, rows: rowCount(d), same: !d.scope?.id || d.scope.id === CFG.scopeId() };
}
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function restore(d, onProgress = () => {}) {
  d = unwrap(d);
  const done = {}, errors = [];
  for (const tb of CFG.tables) {
    const rows = (d.tables[tb] || []).map(CFG.remap); if (!rows.length) continue;
    onProgress(tb); let n = 0;
    for (const part of chunks(rows, 200)) { const { error } = await SB.client.from(tb).upsert(part, { ignoreDuplicates: true }); /* 只补缺的：已有同主键的不动 */ if (error) { errors.push([tb, error.message]); break; } n += part.length; }
    done[tb] = n;
  }
  return { done, errors };
}

/* ---- 界面：一张 sheet ---- */
const UI = { folder: null, lists: {}, src: null, sql: null, loading: false, stale: true, preview: null, result: null, pendingOpen: false };
// 能列出 / 恢复的来源（文件夹和下载的备份通过「选备份文件」读回来）
const SOURCES = {   // 顺序即显示顺序：Google Drive 在前（默认选它），再 Dropbox，最后应用云端
  gdrive: { icon: "▲", label: "Google Drive", ready: () => DR.gdOn(), list: () => DR.gdList(false), read: DR.gdRead, del: DR.gdDelete },
  dropbox: { icon: "◆", label: "Dropbox", ready: () => DR.dbxOn(), list: DR.dbxList, read: DR.dbxRead, del: DR.dbxDelete },
  cloud: { icon: "🗄️", label: "应用云端", ready: () => CFG.ready(), list: listCloud, read: readCloud, del: deleteCloud },
};
const available = () => Object.keys(SOURCES).filter((k) => SOURCES[k].ready());
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
/** 一张可勾选的「目标卡」：整张卡都能点，勾选框在左，右边标题 + 说明 + 这张卡自己的设置 */
const card = (k, on, icon, title, desc, body = "", off = false) => `<label class="bk-card ${on && !off ? "on" : ""} ${off ? "off" : ""}"><input type="checkbox" name="target" value="${k}" ${on ? "checked" : ""} ${off ? "disabled" : ""}><span class="bk-ic" aria-hidden="true">${icon}</span><span class="bk-body"><b>${title}</b><small>${desc}</small>${body ? `<span class="bk-sub">${body}</span>` : ""}</span></label>`;
function loadUi(redraw) {
  if (!UI.stale) return; UI.stale = false; UI.loading = true;
  const srcs = available();
  Promise.all([folderStatus().catch(() => ({ supported: false, perm: "none", name: "" })), sqlStatus().catch(() => ({ name: "" })), ...srcs.map((k) => SOURCES[k].list().catch(() => []))]).then(([f, q, ...ls]) => { UI.folder = f; UI.sql = q; srcs.forEach((k, i) => { UI.lists[k] = ls[i]; }); UI.loading = false; redraw(); });
}
function bkBody(cloudOn, syncLine) {
  const s = settings(), folder = UI.folder || { supported: folderSupported(), perm: "none", name: "" }, sql = UI.sql || { name: "" }, has = (k) => s.targets.includes(k), due = nextDue(s);
  const prov = PROVIDERS.find((p) => p.id === s.provider) || PROVIDERS[0];
  const provSel = `<select name="provider" aria-label="${esc(t("云盘"))}">${PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === prov.id ? "selected" : ""}>${esc(t(p.name))}</option>`).join("")}</select>`;
  const folderBody = !folder.supported ? `<em class="bk-warn">${t("这个浏览器不能直接写文件夹（手机、iPad 和 Safari 都不行）。手机上用「下载到设备」，再在系统的分享 / 文件里存到 iCloud Drive 或 Google Drive。")}</em>`
    : `<span class="bk-row">${provSel}${folder.name ? `<span class="bk-pill ok">📁 ${esc(folder.name)}${folder.perm !== "granted" ? ` · ${t("待授权")}` : ""}</span>` : ""}</span>
       <span class="bk-row">${folder.name ? `${folder.perm !== "granted" ? `<button class="btn" data-act="bk-grant">${t("授权这台电脑写入")}</button>` : ""}<button class="chip" data-act="bk-pick">${t("换文件夹")}</button><button class="chip" data-act="bk-forget">${t("不再用")}</button>` : `<button class="btn" data-act="bk-pick">${t("选同步文件夹")}</button>`}</span>
       <em>${esc(t(prov.hint))}</em>`;
  const sqlBody = `<span class="bk-row">${sql.name ? `<span class="bk-pill ok">📁 ${esc(sql.name)}</span><button class="chip" data-act="bk-forget-sql">${t("不再用")}</button>` : folder.supported ? `<button class="chip" data-act="bk-pick-sql">${t("选 supabase 文件夹")}</button>` : ""}</span>`;
  const status = s.last ? t("上次备份 {d}", { d: when(s.last) }) : t("还没备份过");
  const nextTxt = !intervalDays(s) ? t("没开定时") : due && due.getTime() <= Date.now() ? t("已到期，下次打开应用时自动备份") : t("下次 {d}", { d: when(due.toISOString()) });
  const srcs = available(); let cloudList = "";
  if (srcs.length) {
    UI.src = srcs.includes(UI.src) ? UI.src : srcs[0]; const list = UI.lists[UI.src] || [], S0 = SOURCES[UI.src];
    const row = (f) => `<div class="medrow"><div><b>${esc(f.name)}</b><br><span class="small muted">${esc(when(f.at))} · ${kb(f.size)}</span></div><span class="bk-row"><button class="chip" data-act="bk-dl" data-src="${UI.src}" data-id="${esc(f.id || f.name)}" data-name="${esc(f.name)}">${t("下载")}</button><button class="chip" data-act="bk-use" data-src="${UI.src}" data-id="${esc(f.id || f.name)}">${t("恢复")}</button><button class="chip" data-act="bk-rm" data-src="${UI.src}" data-id="${esc(f.id || f.name)}" data-name="${esc(f.name)}" aria-label="${esc(t("删除"))}">✕</button></span></div>`;
    cloudList = `<div class="panel bk-panel"><div class="lab">${t("备份记录")}</div>${srcs.length > 1 ? `<div class="bk-seg">${srcs.map((k) => `<button type="button" class="chip" data-act="bk-src" data-src="${k}" aria-pressed="${k === UI.src}">${SOURCES[k].icon} ${t(SOURCES[k].label)}</button>`).join("")}</div>` : `<p class="small muted">${S0.icon} ${t(S0.label)}</p>`}
      ${UI.loading ? `<p class="small muted">${t("读取中…")}</p>` : list.length ? list.slice(0, 3).map(row).join("") + (list.length > 3 ? `<details class="bk-more"><summary>${t("更早的 {n} 条", { n: Math.min(list.length, 30) - 3 })}</summary>${list.slice(3, 30).map(row).join("")}</details>` : "") : `<p class="small muted">${t("这里还没有备份。上面勾上它，再点「现在备份」。")}</p>`}</div>`;
  }
  const notCfg = t("需要先在 js/core/config.js 里填好（见 README「云盘备份」）");
  const driveCard = (k, icon, label, cfgd, tk, pathName, pathLabel, pathVal, ph, pathText) => card(k, has(k), icon, label, cfgd ? t("放在你 {d} 里指定的文件夹，手机电脑都能用；只留 {n} 天", { d: label, n: KEEP_DAYS }) : notCfg,
    !cfgd ? "" : (k === "gdrive" && s.gdId ? `<span class="bk-row"><span class="bk-pill ok">📁 ${esc(s.gdName || t("已选的文件夹"))}</span><button class="chip" data-act="bk-gd-clear">${t("改用路径")}</button></span>` : `<span class="bk-row bk-path"><label class="small muted">${pathLabel}</label><input name="${pathName}" value="${esc(pathVal || "")}" placeholder="${esc(ph)}" maxlength="120" autocomplete="off"></span>${k === "gdrive" ? `<small class="bk-hint">${t("只能用应用自己建的文件夹；想用你在 Drive 里已有的文件夹，请点下面的「或在 Drive 里选一个文件夹…」。")}</small>` : ""}${k === "gdrive" && tk && DR.gdPickerAvailable() ? `<span class="bk-row"><button class="chip" data-act="bk-gd-pick">${t("或在 Drive 里选一个文件夹…")}</button></span>` : ""}`) + `<span class="bk-row">${tk ? `<span class="bk-pill ok">${t("已连接")}${tk.email ? ` ${esc(tk.email)}` : ""}${pathText ? ` · ${esc(pathText)}` : ""}</span><button class="chip" data-act="bk-${k === "gdrive" ? "gd" : "dbx"}-off">${t("断开")}</button>` : `<button class="btn" data-act="bk-${k === "gdrive" ? "gd" : "dbx"}-on">${t("连接 {d}", { d: label })}</button>`}</span>`, !cfgd || !tk);
  const pv = UI.preview;
  const preview = !pv ? "" : pv.ok ? `<div class="bk-notice"><b>${t("备份来自 {h}，{d}，共 {n} 行", { h: esc(pv.scope || t("未知")), d: when(pv.exported_at), n: pv.rows })}</b><p class="small muted">${Object.entries(pv.counts).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</p>
      ${pv.same ? "" : `<p class="small muted">${t("这是另一个账号的备份（换了项目或重新注册时正常）：会导进现在登录的账号。")}</p>`}
      <p class="small">${t("恢复 = 把文件里的数据导回我的账号：只补缺的：已有同主键的行不动，文件里没有的行也不删。")}</p>
      <div class="bk-row" style="margin-top:8px"><button class="btn primary" data-act="bk-restore">${t("恢复到我的账号")}</button><button class="btn" data-act="bk-cancel">${t("取消")}</button></div></div>`
    : `<div class="bk-notice bad"><b>${t("不能恢复：{why}", { why: esc(pv.why) })}</b> <button class="chip" data-act="bk-cancel">${t("关闭")}</button></div>`;
  return `<div class="bk-sync">${syncLine}</div>
    ${S.backupPending ? `<div class="bk-notice"><b>${t("定时备份在等你点一下")}</b> ${t("写入这台电脑的文件夹需要你授权一次。")} <button class="btn" data-act="bk-now">${t("继续备份")}</button></div>` : ""}
    ${UI.result ? `<div class="bk-notice ${UI.result.ok === false ? "bad" : ""}"><b>${esc(UI.result.title)}</b>${UI.result.detail ? `<p class="small muted">${esc(UI.result.detail)}</p>` : ""}</div>` : ""}
    <div class="panel bk-panel bk-status"><div><b>${esc(status)}</b><small>${s.lastInfo ? `${esc(s.lastInfo)} · ` : ""}${esc(nextTxt)}</small></div>
      <div class="bk-row"><button class="btn primary" data-act="bk-now">${t("现在备份")}</button><button class="btn" data-act="bk-download">${t("下载一份")}</button></div></div>
    <form id="backupForm" class="panel bk-panel" onsubmit="return false">
      <div class="bk-notice"><b>${t("定时备份由小月亮统一做")}</b> ${t("小月亮的「同步、备份与恢复」会连同家庭学堂、牧羊人一起定时备份（家主备份全家，含每位家人的数据）；这里只用来手动备份 / 恢复本应用。云盘连接与小月亮共用，在任一应用连接一次即可。")}</div>
      <div class="lab">${t("备份到哪")} <span class="small muted">${t("可多选")}</span></div>
      <div class="bk-cards">
        ${card("folder", has("folder"), "☁️", t("云盘同步文件夹"), t("Google Drive / Dropbox / OneDrive / iCloud Drive 的电脑客户端都有一个同步文件夹，选它就等于备份上了那家云盘；也可以选电脑上任何位置。只留 {n} 天。", { n: KEEP_DAYS }), folderBody)}
        ${cloudOn ? card("cloud", has("cloud"), "🗄️", t("应用自己的云端"), t("我自己在共用的 Supabase 项目里的存储（只有本人能看），任何设备都能恢复；只留 {n} 天；需要先执行迁移 017。", { n: KEEP_DAYS })) : ""}
        ${driveCard("gdrive", "▲", "Google Drive", DR.gdConfigured(), DR.tok("gd"), "gdPath", t("Drive 里的文件夹路径"), s.gdPath, CFG.title + "备份", DR.gdOn() ? DR.gdPathText() : "")}
        ${driveCard("dropbox", "◆", "Dropbox", DR.dbxConfigured(), DR.tok("dbx"), "dbxPath", t("应用文件夹里的子路径"), s.dbxPath, t("留空 = 直接放应用文件夹"), "")}
        ${card("download", has("download"), "⬇️", t("下载到设备"), t("每次弹出下载。手机上下载后可以「存储到文件」放进 iCloud Drive / Google Drive；浏览器下载的旧文件不会自动清理。"))}
      </div>
      <div class="bk-sql"><b>⚠️ ${t("数据库脚本不在备份里")}</b><small>${t("baby-log 仓库的 supabase/schema.sql 和 migrations 只在你的电脑上（不进 git）。电脑没了，备份文件就导不回去。请把这个文件夹手动拷到云盘或别的位置；选了云盘同步文件夹的话，可以让每次备份顺带把 .sql 一起拷进去：")}</small>${sqlBody}</div>
    </form>
    ${cloudList}
    <div class="panel bk-panel"><div class="lab">${t("从备份恢复")}</div><p class="small muted">${t("换了手机、数据库被删、或换了 Supabase 项目：先登录（新项目要先在 SQL Editor 执行 baby-log 仓库的 supabase/schema.sql，再注册），再在这里选备份文件导回来；家庭可见的项会挂到现在的家庭。")}</p>
      <div class="bk-row"><label class="btn">${t("选备份文件")}<input id="backupFile" type="file" accept="application/json,.json" hidden></label></div>${preview}</div>`;
}
function openBackup() {
  if (!CFG.ready()) { toast(t("先登录")); return; }
  loadUi(() => { if ($("#backupForm")) openBackup(); });
  $("#sheetIn").innerHTML = `${head(esc(t("备份与恢复")))}${bkBody(true, `<span>${t("已连接云端")} · ${esc(CFG.scopeName())}</span>`)}`;
  showSheet();
}
/* ---- 事件（events.js 的 data-act 分发里调 bkAct；change 里调 bkChange） ---- */
async function bkAct(act, el) {
  const redraw = () => { UI.stale = true; openBackup(); };
  switch (act) {
    case "bk-open": UI.preview = null; UI.result = null; openBackup(); break;
    case "bk-now": case "bk-download": {
      el.disabled = true;
      try { const r = await runBackup(act === "bk-download" ? ["download"] : (settings().targets.length ? settings().targets : ["download"]), true); S.backupPending = r.needGesture;
        const sqlNote = r.sqlN ? t("已顺带拷贝 {n} 个 SQL 文件。", { n: r.sqlN }) : t("提醒：数据库脚本（supabase/*.sql）不在备份里，请手动把它拷到云盘或别的位置。");
        UI.result = r.ok.length ? { title: t("已备份到 {to}：{name}（{n} 行）", { to: r.ok.map(targetName).join("、"), name: r.name, n: r.rows }), detail: [sqlNote, ...r.failed.map(([k, w]) => `${targetName(k)}：${w}`)].join("；") } : { ok: false, title: t("备份没成功"), detail: r.failed.map(([k, w]) => `${targetName(k)}：${w}`).join("；") }; }
      catch (e) { UI.result = { title: t("备份没成功"), detail: e.message }; }
      redraw(); break; }
    case "bk-gd-pick": try { const f = await DR.gdPickFolder(); if (f) { saveSettings({ gdId: f.id, gdName: f.name }); toast(t("以后备份放到「{n}」", { n: f.name })); } } catch (e) { toast(t("选文件夹失败：{msg}", { msg: e.message })); } redraw(); break;
    case "bk-gd-clear": saveSettings({ gdId: "", gdName: "" }); redraw(); break;
    case "bk-pick-sql": try { await pickSqlFolder(); toast(t("以后每次写云盘文件夹时会把 .sql 一起拷进 sql/ 子目录")); } catch (e) { if (e.name !== "AbortError") toast(t("选文件夹失败：{msg}", { msg: e.message })); } redraw(); break;
    case "bk-forget-sql": await forgetSqlFolder(); redraw(); break;
    case "bk-pick": try { await pickFolder(); toast(t("已记住这个文件夹")); } catch (e) { if (e.name !== "AbortError") toast(t("选文件夹失败：{msg}", { msg: e.message })); } redraw(); break;
    case "bk-forget": await forgetFolder(); redraw(); break;
    case "bk-grant": { const st = await folderStatus(); if (st.handle) { try { await st.handle.requestPermission({ mode: "readwrite" }); } catch (e) { /* 取消 */ } } redraw(); break; }
    case "bk-src": UI.src = el.dataset.src; openBackup(); break;
    case "bk-dl": try { const d = await SOURCES[el.dataset.src].read(el.dataset.id); download(toBlob(d), el.dataset.name); } catch (e) { toast(t("下载失败：{msg}", { msg: e.message })); } break;
    case "bk-use": try { const d = await SOURCES[el.dataset.src].read(el.dataset.id); UI.preview = { ...inspect(d), data: d }; } catch (e) { toast(t("读取失败：{msg}", { msg: e.message })); } openBackup(); break;
    case "bk-rm": if (!confirm(t("删除备份 {n}？", { n: el.dataset.name }))) break; try { await SOURCES[el.dataset.src].del(el.dataset.id); } catch (e) { toast(t("删除失败：{msg}", { msg: e.message })); } redraw(); break;
    case "bk-gd-on": el.disabled = true; try { await DR.gdConnect(); saveSettings({ targets: [...new Set([...settings().targets, "gdrive"])] }); toast(t("已连接 Google Drive")); } catch (e) { toast(t("连接 Google Drive 失败：{msg}", { msg: e.message })); } redraw(); break;
    case "bk-gd-off": DR.gdDisconnect(); saveSettings({ targets: settings().targets.filter((x) => x !== "gdrive") }); redraw(); break;
    case "bk-dbx-on": try { await DR.dbxConnect(); } catch (e) { toast(t("连接 Dropbox 失败：{msg}", { msg: e.message })); } break;
    case "bk-dbx-off": await DR.dbxDisconnect(); saveSettings({ targets: settings().targets.filter((x) => x !== "dropbox") }); redraw(); break;
    case "bk-cancel": UI.preview = null; openBackup(); break;
    case "bk-restore": {
      const pv = UI.preview; if (!pv?.ok) break;
      if (!confirm(t("把备份（{d}，{n} 行）导回我的账号「{h}」？只补缺的，已有的不动、不删。", { d: String(pv.exported_at).slice(0, 16).replace("T", " "), n: pv.rows, h: CFG.scopeName() }))) break;
      el.disabled = true; el.textContent = t("恢复中…");
      try { const r = await restore(pv.data, (tb) => { el.textContent = t("恢复中… {t}", { t: tb }); }); const n = Object.values(r.done).reduce((a, b) => a + b, 0);
        UI.result = { title: r.errors.length ? t("恢复了 {n} 行，但有表出错", { n }) : t("已恢复 {n} 行", { n }), detail: r.errors.map(([tb, w]) => `${tb}：${w}`).join("；") }; UI.preview = null; await CFG.afterRestore(); }
      catch (e) { UI.result = { title: t("恢复失败"), detail: e.message }; }
      openBackup(); break; }
    default: return false;
  }
  return true;
}
async function bkChange(ev) {
  const el = ev.target;
  if (el.closest && el.closest("#backupForm")) {
    const f = el.closest("#backupForm"), targets = [...f.querySelectorAll('input[name="target"]:checked')].map((x) => x.value);
    saveSettings({ every: f.elements.every?.value ?? settings().every, days: Math.max(1, +(f.elements.days?.value ?? settings().days) || 14), targets, provider: f.elements.provider?.value || "any", gdPath: (f.elements.gdPath?.value || "").trim(), dbxPath: (f.elements.dbxPath?.value || "").trim() });
    const box = f.querySelector("[data-bk-days]"); if (box) box.hidden = f.elements.every.value !== "custom";
    if (el.name === "gdPath" || el.name === "dbxPath") UI.stale = true;   // 路径改了：列表换到新文件夹
    if (["every", "provider", "target", "gdPath", "dbxPath"].includes(el.name)) openBackup();
    return true;
  }
  if (el.id === "backupFile") {
    const file = el.files?.[0]; if (!file) return true;
    try { const d = JSON.parse(await file.text()); UI.preview = { ...inspect(d), data: d }; } catch (e) { UI.preview = { ok: false, why: t("不是有效的 JSON 文件") }; }
    el.value = ""; openBackup(); return true;
  }
  return false;
}
const backupSummary = () => { const s = settings(); return `${!intervalDays(s) ? t("定时备份已关") : s.every === "week" ? t("每周") : s.every === "month" ? t("每月") : t("每 {n} 天", { n: s.days })} · ${s.last ? t("上次 {d}", { d: String(s.last).slice(0, 10) }) : t("还没备份过")}`; };

export { openBackup, bkAct, bkChange, runScheduled, initProviders, backupSummary, settings as backupSettings };
