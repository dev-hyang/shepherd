import { BABY_LOG_URL, SUPABASE_ANON_KEY, SUPABASE_JS, SUPABASE_URL } from "./config.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { $, esc, toast } from "./util.js";
import { attachRealtime, loadAll } from "../wb.js";
import { refreshSettingsIfOpen, render } from "../views.js";

/* ============ 登录与家庭（与小月亮共用同一套表） ============
   小月亮负责创建家庭、邀请家人；这里读同一份家庭和成员。
   这个应用的数据是个人的，所以必须是正式账号（邮箱 + 密码）：
   用邀请码进小月亮的家人是匿名身份，换个设备就找不回来了。匿名用户在这里先"绑定邮箱"，
   Supabase 会把同一个 user_id 升级成正式账号，家庭身份和小月亮里的记录都不变。
   没加入家庭也能用；只是"开给家人看"的功能要有家庭才有意义。 */
const SB = { configured: false, client: null, uid: undefined, channel: null };
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
  teardownRealtime(); S.family = null; S.members = {};
  if (!S.user) { S.cloud = "signedout"; render(); refreshSettingsIfOpen(); return; }
  if (S.user.is_anonymous) { S.cloud = "anon"; render(); refreshSettingsIfOpen(); return; }
  const { data, error } = await SB.client.from("family_members").select("family_id, families(*)").eq("user_id", S.user.id).limit(1);
  if (error) { S.cloud = "offline"; toast(t("连接云端失败，请稍后刷新")); render(); refreshSettingsIfOpen(); return; }
  S.family = data.length && data[0].families ? data[0].families : null;
  if (S.family) await loadMembers();
  S.cloud = "ready";
  render();
  await loadAll();
  setupRealtime();
  render(); refreshSettingsIfOpen();
}
async function loadMembers(){
  const { data, error } = await SB.client.from("family_members").select("user_id, display_name, role").eq("family_id", S.family.id);
  if (error) return;
  S.members = Object.fromEntries((data || []).map(m => [m.user_id, { name: m.display_name || t("家人"), role: m.role || "member" }]));
  if (S.user && S.family && !S.members[S.user.id]) { toast(t("你已不在这个家庭里")); await afterAuth(); }
}
function setupRealtime(){
  teardownRealtime();
  SB.channel = SB.client.channel("shepherd-" + S.user.id);
  if (S.family) SB.channel.on("postgres_changes", { event: "*", schema: "public", table: "family_members", filter: "family_id=eq." + S.family.id }, async () => { await loadMembers(); if (!S.family) return; if (!$("#sheet").open) render(); else refreshSettingsIfOpen(); });
  attachRealtime(SB.channel, () => { if (!$("#sheet").open) render(); });
  SB.channel.subscribe();
}
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
  toast(kind === "create" ? t("家庭已创建") : t("已加入家庭"));
  await afterAuth();
}
async function sbLogout(){ await SB.client.auth.signOut(); toast(t("已退出")); }

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
  if (!S.family) return `
    <p class="small muted">${t("已登录 {email}。还没加入家庭：个人记录照常可用；想让配偶看到你的完成情况，先在", { email: esc(S.user.email) })}<a href="${BABY_LOG_URL}" target="_blank" rel="noopener">${t("小月亮")}</a>${t("里创建家庭，或者在这里创建 / 用邀请码加入。")}</p>
    <div class="field"><label for="sb_display">${t("你在家里的称呼")}</label><input id="sb_display" type="text" placeholder="${t("妈妈 / 爸爸")}"></div>
    <div class="btns"><button class="btn primary" data-act="sb-create">${t("创建家庭")}</button></div>
    <div class="field"><label for="sb_code">${t("或者输入邀请码")}</label><input id="sb_code" type="text" autocapitalize="characters" autocomplete="off"></div>
    <div class="btns"><button class="btn" data-act="sb-join">${t("加入家庭")}</button><button class="btn" data-act="sb-logout">${t("退出登录")}</button></div>`;
  const me = S.user.id;
  const rows = Object.entries(S.members).map(([uid, m]) => `<div class="medrow"><div><b>${esc(m.name)}</b>${uid === me ? ` <span class="small muted">${t("（你）")}</span>` : ""}${m.role === "owner" ? ` <span class="pill ok">${t("家主")}</span>` : ""}</div></div>`).join("");
  return `
    <p class="small muted" style="margin-bottom:0">${t("家庭成员")}</p>
    <div class="panel" style="padding:0 14px">${rows || `<div class="medrow"><span class="muted">${t("只有你")}</span></div>`}</div>
    <p style="margin-top:12px">${t("邀请码")} <b class="num" style="font-size:20px;letter-spacing:.12em">${esc(S.family.invite_code)}</b> <button class="chip" data-copy="${esc(S.family.invite_code)}">${t("复制")}</button></p>
    <p class="small muted">${t("已登录 {email}。成员管理（改称呼、设家主、移除）在小月亮的设置里。", { email: esc(S.user.email) })}</p>
    <div class="btns"><button class="btn" data-act="sb-logout">${t("退出登录")}</button></div>`;
}

export { SB, memberName, myName, initSupabase, afterAuth, sbAuth, sbLink, sbFamily, sbLogout, familyHTML };
