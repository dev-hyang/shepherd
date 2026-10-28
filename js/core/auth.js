import { BABY_LOG_URL, SUPABASE_ANON_KEY, SUPABASE_JS, SUPABASE_URL } from "./config.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { $, esc, toast } from "./util.js";
import { attachRealtime, loadAll } from "../wb.js";
import { runScheduled } from "../backup.js";
import { attachRealtime as attachTaskRealtime, loadTasks } from "../tk.js";
import { attachRealtime as attachNoteRealtime, loadNotes } from "../nt.js";
import { refreshSettingsIfOpen, render } from "../views.js";

/* ============ 登录与家庭（与小月亮共用同一套表） ============
   小月亮负责创建家庭、邀请家人；这里读同一份家庭和成员。
   这个应用的数据是个人的，所以必须是正式账号（邮箱 + 密码）：
   用邀请码进小月亮的家人是匿名身份，换个设备就找不回来了。匿名用户在这里先"绑定邮箱"，
   Supabase 会把同一个 user_id 升级成正式账号，家庭身份和小月亮里的记录都不变。
   没加入家庭也能用；只是"开给家人看"的功能要有家庭才有意义。 */
const SB = { configured: false, client: null, uid: undefined, channel: null, waitTimer: null };
const memberName = uid => (S.members[uid] && S.members[uid].name) || t("家人");
const myName = () => (S.user && memberName(S.user.id)) || t("我");

function initSupabase(){
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get("error_code")) {
    const code = hp.get("error_code");
    setTimeout(() => toast(code === "otp_expired" ? t("确认链接已失效：请直接用邮箱和密码登录试试，不行再重新注册") : t("登录链接有问题：") + (hp.get("error_description") || code)), 300);
    history.replaceState(null, "", location.pathname + location.search);
  }
  SB.configured = /^https:\/\/.+/.test(SUPABASE_URL) && !SUPABASE_URL.includes("YOUR-") && !SUPABASE_ANON_KEY.includes("YOUR-");
  if (!SB.configured) { S.cloud = "offline"; render(); return false; }
  const tag = document.createElement("script");
  tag.src = SUPABASE_JS;
  tag.onload = () => {
    SB.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    SB.client.auth.onAuthStateChange((_evt, session) => {
      const uid = session?.user?.id || null;
      S.user = session?.user || null;
      // 匿名 → 正式账号时 uid 不变，但 is_anonymous 变了，也要重新进入
      const key = uid ? uid + ":" + (S.user.is_anonymous ? "a" : "e") : null;
      if (key === SB.uid) return;
      SB.uid = key;
      setTimeout(afterAuth, 0); // don't call Supabase inside its own auth callback
    });
  };
  tag.onerror = () => { S.cloud = "offline"; toast(t("云端组件加载失败，请检查网络后刷新")); render(); };
  document.head.appendChild(tag);
  return true;
}
async function afterAuth(){
  teardownRealtime(); clearInterval(SB.waitTimer); S.family = null; S.members = {}; S.pending = []; S.waiting = null;
  if (!S.user) { S.cloud = "signedout"; render(); refreshSettingsIfOpen(); return; }
  if (S.user.is_anonymous) { S.cloud = "anon"; render(); refreshSettingsIfOpen(); return; }
  const { rows, error } = await myMemberships();
  if (error) { S.cloud = "offline"; toast(t("连接云端失败，请稍后刷新")); render(); refreshSettingsIfOpen(); return; }
  const active = rows.find(r => (r.status || "active") === "active" && r.families);
  const pend = rows.find(r => r.status === "pending");
  S.family = active ? active.families : null;
  // 待批准的行 families 是 null（行级安全藏起来了），所以靠 status 判断「在等家主批准」，不是「没加入」
  S.waiting = !active && pend ? { family_id: pend.family_id } : null;
  if (S.family) await loadMembers();
  if (S.waiting) SB.waitTimer = setInterval(recheckWaiting, 20000);
  S.cloud = "ready";
  render();
  await loadAll();
  runScheduled();   // 定时备份到期了就在后台做一次
  try { await loadTasks(); } catch (e) { console.error(e); }   // 任务表（迁移 015）没建时只影响任务页签
  try { await loadNotes(); } catch (e) { console.error(e); }   // 笔记表（迁移 016）没建时只影响笔记页
  setupRealtime();
  render(); refreshSettingsIfOpen();
}
// 读我的成员行。迁移 022 之前没有 status 列（42703）：去掉它再读一次，status 为空按正式成员处理
async function myMemberships(){
  let r = await SB.client.from("family_members").select("family_id, status, families(*)").eq("user_id", S.user.id);
  if (r.error && (r.error.code === "42703" || /status/i.test(r.error.message))) r = await SB.client.from("family_members").select("family_id, families(*)").eq("user_id", S.user.id);
  return { rows: r.data || [], error: r.error };
}
// 等待批准时每 20 秒（和成员表的实时通知）再查一次，变成正式成员就进入家庭
async function recheckWaiting(){
  if (!S.user || !S.waiting) { clearInterval(SB.waitTimer); return; }
  const { rows, error } = await myMemberships();
  if (error || !S.waiting) return;
  if (rows.some(r => (r.status || "active") === "active" && r.families)) { toast(t("家主已批准，你已加入家庭")); await afterAuth(); }
  else if (!rows.some(r => r.status === "pending")) { toast(t("申请没有通过，可以重新输入邀请码")); await afterAuth(); }
}
async function loadMembers(){
  let r = await SB.client.from("family_members").select("user_id, display_name, role, status").eq("family_id", S.family.id);
  if (r.error && (r.error.code === "42703" || /status/i.test(r.error.message))) r = await SB.client.from("family_members").select("user_id, display_name, role").eq("family_id", S.family.id);
  const { data, error } = r;
  if (error) return;
  const act = (data || []).filter(m => (m.status || "active") === "active");
  S.members = Object.fromEntries(act.map(m => [m.user_id, { name: m.display_name || t("家人"), role: m.role || "member" }]));
  S.pending = isOwner() ? (data || []).filter(m => m.status === "pending").map(m => ({ uid: m.user_id, name: m.display_name || t("家人") })) : [];
  if (S.user && S.family && !S.members[S.user.id]) { toast(t("你已不在这个家庭里")); await afterAuth(); }
}
function setupRealtime(){
  teardownRealtime();
  SB.channel = SB.client.channel("shepherd-" + S.user.id);
  const fid = S.family ? S.family.id : S.waiting && S.waiting.family_id;
  if (fid) SB.channel.on("postgres_changes", { event: "*", schema: "public", table: "family_members", filter: "family_id=eq." + fid }, async () => { if (S.waiting) { await recheckWaiting(); return; } await loadMembers(); if (!S.family) return; if (!$("#sheet").open) render(); else refreshSettingsIfOpen(); });
  attachRealtime(SB.channel, () => { if (!$("#sheet").open) render(); });
  if (S.tk.loaded) attachTaskRealtime(SB.channel, () => { if (!$("#sheet").open) render(); });   // 任务表没建（迁移 015）时不订阅，免得整个频道订阅失败
  if (S.nt.loaded) attachNoteRealtime(SB.channel, () => { if (!$("#sheet").open) render(); });   // 同上：表没建（迁移 016）不订阅
  SB.channel.subscribe();
}
const isOwner = () => !!(S.user && S.members[S.user.id] && S.members[S.user.id].role === "owner");
function teardownRealtime(){ if (SB.channel && SB.client) { SB.client.removeChannel(SB.channel); SB.channel = null; } }

async function sbAuth(kind){
  const email = $("#sb_email")?.value.trim(), password = $("#sb_pw")?.value || "";
  if (!email || password.length < 6) { toast(t("请填写邮箱和至少 6 位的密码")); return; }
  if (kind === "signup") {
    const { data, error } = await SB.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { toast(t("注册失败：") + (/registered/i.test(error.message) ? t("这个邮箱已注册，直接登录") : error.message)); return; }
    toast(data.session ? t("注册成功") : t("已注册。请先到邮箱点确认链接，再回来登录"));
  } else {
    const { error } = await SB.client.auth.signInWithPassword({ email, password });
    toast(error ? t("登录失败：邮箱或密码不对") : t("已登录"));
  }
}
// 匿名用户绑定邮箱：同一个 user_id 升级为正式账号。Supabase 默认要先点邮箱里的确认链接，邮箱才算生效。
async function sbLink(){
  const email = $("#sb_email")?.value.trim(), password = $("#sb_pw")?.value || "";
  if (!email || password.length < 6) { toast(t("请填写邮箱和至少 6 位的密码")); return; }
  const { error } = await SB.client.auth.updateUser({ email, password }, { emailRedirectTo: location.origin + location.pathname });
  if (error) { toast(t("绑定失败：") + (/already|registered|exists/i.test(error.message) ? t("这个邮箱已被别的账号使用，请退出后直接登录那个账号") : error.message)); return; }
  toast(t("已发送确认邮件。点邮件里的链接后回到这里刷新，账号就变成正式账号了"));
}
async function sbFamily(kind){
  const display = $("#sb_display")?.value.trim() || t("家人");
  const { data, error } = kind === "create"
    ? await SB.client.rpc("create_family", { p_name: t("我们家"), p_display: display })
    : await SB.client.rpc("join_family", { p_code: $("#sb_code")?.value || "", p_display: display });
  if (error || !data) { toast(kind === "join" ? t("邀请码不对，请核对后再试") : t("创建失败，请稍后再试")); return; }
  if (kind === "create") { toast(t("家庭已创建")); await afterAuth(); return; }
  // 迁移 022 之后返回 { status, ... }；之前返回 families 一行（没有 status）= 直接加入成功
  const st = data.status || "active";
  const msg = { invalid: t("邀请码不对，请核对后再试"), expired: t("邀请码已过期，请家主重新生成"), throttled: t("尝试太多次，请 {n} 分钟后再试", { n: data.retry_minutes || 15 }), full: t("等待批准的人太多，请让家主先处理") }[st];
  if (msg) { toast(msg); return; }
  toast(st === "pending" ? t("申请已发出，等家主批准") : t("已加入家庭"));
  await afterAuth();
}
// 家主操作：批准 / 拒绝加入申请，重新生成 / 关闭邀请
async function ownerRpc(name, args, done){
  const { data, error } = await SB.client.rpc(name, args);
  if (error) { toast(t("操作失败：{msg}", { msg: error.message })); return null; }
  if (done) toast(done);
  return data || true;
}
async function sbApprove(uid){
  if (!await ownerRpc("approve_member", { p_family: S.family.id, p_user: uid }, t("已批准"))) return;
  await loadMembers(); render(); refreshSettingsIfOpen();
}
async function sbReject(uid){
  const m = S.pending.find(x => x.uid === uid);
  if (!confirm(t("拒绝 {name} 的加入申请？", { name: m ? m.name : t("家人") }))) return;
  if (!await ownerRpc("remove_member", { p_family: S.family.id, p_user: uid }, t("已拒绝"))) return;
  await loadMembers(); render(); refreshSettingsIfOpen();
}
async function sbResetInvite(){
  if (!confirm(t("重新生成邀请码？旧邀请码立刻失效，新的 7 天内有效。"))) return;
  const row = await ownerRpc("reset_invite_code", { p_family: S.family.id }, t("已生成新邀请码"));
  if (!row) return;
  if (row.invite_code) S.family = { ...S.family, invite_code: row.invite_code, invite_expires_at: row.invite_expires_at };
  render(); refreshSettingsIfOpen();
}
async function sbCloseInvite(){
  if (!confirm(t("关闭邀请？关闭后没有人能用邀请码加入，需要时可以再重新生成。"))) return;
  if (!await ownerRpc("close_invite", { p_family: S.family.id }, t("邀请已关闭"))) return;
  S.family = { ...S.family, invite_expires_at: new Date().toISOString() };
  render(); refreshSettingsIfOpen();
}
async function sbLogout(){ await SB.client.auth.signOut(); toast(t("已退出")); }

// 邀请有效期（迁移 022 之前没有这一列：什么都不显示）
function inviteLine(owner){
  const exp = S.family.invite_expires_at;
  if (exp === undefined) return "";
  const ms = exp ? new Date(exp).getTime() - Date.now() : 0;
  const text = ms > 0 ? t("邀请码有效至 {d}", { d: new Date(exp).toLocaleDateString() }) : t("邀请已关闭 / 已过期");
  return `<p class="small muted" style="margin:0 0 6px">${text}</p>` + (owner ? `<div class="btns"><button class="btn" data-act="sb-reset-invite">${t("重新生成（7 天）")}</button>${ms > 0 ? `<button class="btn" data-act="sb-close-invite">${t("关闭邀请")}</button>` : ""}</div>` : "");
}

function familyHTML(){
  if (!SB.configured) return `<p class="small muted">${t("还没有配置云端：在 js/core/config.js 里填好 Supabase 地址和 key。")}</p>`;
  if (!SB.client) return `<p class="small muted">${t("云端组件还在加载或加载失败。请检查网络后刷新页面。")}</p>`;
  if (!S.user) return `
    <p class="small muted">${t("和小月亮、家庭学堂是同一个账号。在同一台设备上登录过的话，刷新一下通常就已经登录了。")}</p>
    <div class="field"><label for="sb_email">${t("邮箱")}</label><input id="sb_email" type="text" inputmode="email" autocomplete="email"></div>
    <div class="field"><label for="sb_pw">${t("密码（至少 6 位）")}</label><input id="sb_pw" type="password" autocomplete="current-password"></div>
    <div class="btns"><button class="btn primary" data-act="sb-login">${t("登录")}</button><button class="btn" data-act="sb-signup">${t("注册新账号")}</button></div>`;
  if (S.user.is_anonymous) return `
    <p>${t("你现在是用邀请码进来的匿名身份。牧羊人记的是你自己的事，换了设备或清了浏览器就找不回来，所以先给这个账号绑定一个邮箱。绑定后家庭身份和小月亮里的记录都不变。")}</p>
    <div class="field"><label for="sb_email">${t("邮箱")}</label><input id="sb_email" type="text" inputmode="email" autocomplete="email"></div>
    <div class="field"><label for="sb_pw">${t("设一个密码（至少 6 位）")}</label><input id="sb_pw" type="password" autocomplete="new-password"></div>
    <div class="btns"><button class="btn primary" data-act="sb-link">${t("绑定邮箱")}</button><button class="btn" data-act="sb-logout">${t("退出，用别的账号登录")}</button></div>`;
  if (S.waiting) return `
    <div class="panel" role="status"><b>${t("等家主批准")}</b>
      <p class="small muted" style="margin:6px 0 0">${t("你已用邀请码申请加入，家主批准后就能看到家人共享的内容。这期间个人记录照常可用，这里每 20 秒自动检查一次。")}</p>
      <p class="small muted" style="margin:6px 0 0">${t("想取消申请？请联系家主拒绝，或稍后再试。")}</p></div>
    <div class="btns"><button class="btn" data-act="sb-recheck">${t("现在检查")}</button><button class="btn" data-act="sb-logout">${t("退出登录")}</button></div>`;
  if (!S.family) return `
    <p class="small muted">${t("已登录 {email}。还没加入家庭：个人记录照常可用；想让配偶看到你的完成情况，先在", { email: esc(S.user.email) })}<a href="${BABY_LOG_URL}" target="_blank" rel="noopener">${t("小月亮")}</a>${t("里创建家庭，或者在这里创建 / 用邀请码加入。")}</p>
    <div class="field"><label for="sb_display">${t("你在家里的称呼")}</label><input id="sb_display" type="text" placeholder="${t("妈妈 / 爸爸")}"></div>
    <div class="btns"><button class="btn primary" data-act="sb-create">${t("创建家庭")}</button></div>
    <div class="field"><label for="sb_code">${t("或者输入邀请码")}</label><input id="sb_code" type="text" autocapitalize="characters" autocomplete="off"></div>
    <div class="btns"><button class="btn" data-act="sb-join">${t("加入家庭")}</button><button class="btn" data-act="sb-logout">${t("退出登录")}</button></div>`;
  const me = S.user.id;
  const rows = Object.entries(S.members).map(([uid, m]) => `<div class="medrow"><div><b>${esc(m.name)}</b>${uid === me ? ` <span class="small muted">${t("（你）")}</span>` : ""}${m.role === "owner" ? ` <span class="pill ok">${t("家主")}</span>` : ""}</div></div>`).join("");
  const owner = isOwner();
  const pend = owner && S.pending.length ? `
    <div class="panel" style="margin-top:12px;border-color:var(--rose)"><b>${t("等你批准（{n}）", { n: S.pending.length })}</b>
      <p class="small muted" style="margin:4px 0 0">${t("认识这个人再批准：批准后对方能看到你开给家人看的内容。不认识就拒绝。")}</p>
      ${S.pending.map(m => `<div class="medrow"><div><b>${esc(m.name)}</b></div><div class="btns"><button class="btn primary" data-act="sb-approve" data-uid="${esc(m.uid)}">${t("批准")}</button><button class="btn danger" data-act="sb-reject" data-uid="${esc(m.uid)}">${t("拒绝")}</button></div></div>`).join("")}</div>` : "";
  return `
    <p class="small muted" style="margin-bottom:0">${t("家庭成员")}</p>
    <div class="panel" style="padding:0 14px">${rows || `<div class="medrow"><span class="muted">${t("只有你")}</span></div>`}</div>
    ${pend}
    <p style="margin-top:12px">${t("邀请码")} <b class="num" style="font-size:20px;letter-spacing:.12em">${esc(S.family.invite_code)}</b> <button class="chip" data-copy="${esc(S.family.invite_code)}">${t("复制")}</button></p>
    ${inviteLine(owner)}
    <p class="small muted">${t("已登录 {email}。成员管理（改称呼、设家主、移除）在小月亮的设置里。", { email: esc(S.user.email) })}</p>
    <div class="btns"><button class="btn" data-act="sb-logout">${t("退出登录")}</button></div>`;
}

export { SB, memberName, myName, isOwner, initSupabase, afterAuth, recheckWaiting, sbAuth, sbLink, sbFamily, sbLogout, sbApprove, sbReject, sbResetInvite, sbCloseInvite, familyHTML };
