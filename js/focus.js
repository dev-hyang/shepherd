import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { S } from "./core/state.js";
import { $, esc, loadJSON, saveJSON, toast } from "./core/util.js";
import { head, showSheet } from "./sheet.js";
import { render } from "./views.js";
import * as wb from "./wb.js";

/* ============ 专注计时：番茄工作法 + 护眼 ============
   一段专注（默认 25 分钟）→ 短休息（5 分钟）；每 4 段一次长休息（15 分钟）。
   专注期间每 20 分钟弹一次护眼：看 6 米以外 20 秒（20-20-20 法则），倒计时结束自动回到专注，专注时间顺延。
   计时用时间戳算，页面切到后台也不会走偏；状态存在本机 localStorage，刷新页面计时不丢。
   一段专注完成（或中途结束且超过 1 分钟）就记一条 focus 打卡：分钟数、在做什么、护眼几次。
   提醒方式：页面标题倒计时、提示音（Web Audio，不需要音频文件）、可选的桌面通知、手机震动。 */
const KEY = LS_PREFIX + ".focus";
const DEF = { work: 25, brk: 5, longBrk: 15, every: 4, eye: true, eyeEvery: 20, eyeSecs: 20, sound: true, notify: false, autoNext: false };
const localCfg = () => loadJSON(KEY + ".cfg", {});
function cfg(){ return { ...DEF, ...localCfg(), ...((S.wb.loaded && wb.settings().focus) || {}) }; }
async function setCfg(patch){
  const next = { ...cfg(), ...patch };
  saveJSON(KEY + ".cfg", next);
  if (S.wb.loaded) { try { await wb.saveSettings({ focus: next }); } catch (e) {} }
}

/* ---- 状态 ----
   phase: idle（没开始）| work | eye（护眼中，之后回到 work）| break | ready（休息完，等开始下一段）
   endAt 这一阶段的结束时间；total 这一阶段总长；pausedLeft 暂停时剩多少；eyeAt 下次护眼时间；eyeBack 护眼时专注还剩多少 */
let T = loadJSON(KEY, null) || { phase: "idle", n: 0, task: "", eyes: 0 };
const save = () => saveJSON(KEY, T);
const now = () => Date.now();
const running = () => ["work", "eye", "break"].includes(T.phase) && !T.pausedLeft;
const leftMs = () => T.pausedLeft != null ? T.pausedLeft : Math.max(0, (T.endAt || 0) - now());
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

function start(pid){
  const c = cfg();
  T = { phase: "work", n: T.n || 0, task: T.task || "", eyes: 0, total: c.work * 60e3, endAt: now() + c.work * 60e3, startedAt: now(),
    eyeAt: c.eye ? now() + c.eyeEvery * 60e3 : null, practiceId: pid || T.practiceId || (wb.firstOfKind && S.wb.loaded && wb.firstOfKind("focus") ? wb.firstOfKind("focus").id : null) };
  delete T.pausedLeft; save(); unlockAudio(); paint();
}
function pause(){ if (!running()) return; T.pausedLeft = leftMs(); if (T.eyeAt) T.eyeLeft = T.eyeAt - now(); save(); paint(); }
function resume(){ if (T.pausedLeft == null) return; T.endAt = now() + T.pausedLeft; if (T.eyeLeft != null) { T.eyeAt = now() + T.eyeLeft; delete T.eyeLeft; } delete T.pausedLeft; save(); paint(); }
async function stop(){
  if (T.phase === "work" || T.phase === "eye") {
    const elapsed = T.total - (T.phase === "eye" ? T.eyeBack : leftMs());
    if (elapsed >= 60e3) await logSession(Math.round(elapsed / 60e3));
  }
  hideEye(); T = { phase: "idle", n: T.n, task: T.task, eyes: 0, practiceId: T.practiceId }; save(); paint(); render();
}
function skip(){ if (T.phase === "break") { T.phase = "ready"; delete T.pausedLeft; save(); paint(); } else if (T.phase === "eye") endEye(); }
function reset(){ hideEye(); T = { phase: "idle", n: 0, task: "", eyes: 0 }; save(); paint(); }

function startEye(){
  const c = cfg();
  T.eyeBack = Math.max(0, T.endAt - now()); T.phase = "eye"; T.total = c.eyeSecs * 1000; T.endAt = now() + T.total; save();
  beep("eye"); notify(t("看远处 {n} 秒", { n: c.eyeSecs }), t("放松眼睛，看 6 米以外的东西")); showEye(); paint();
}
function endEye(){
  const c = cfg();
  T.phase = "work"; T.endAt = now() + (T.eyeBack || 0); T.total = c.work * 60e3; T.eyeAt = now() + c.eyeEvery * 60e3; T.eyes = (T.eyes || 0) + 1; delete T.eyeBack; save();
  beep("back"); hideEye(); paint();
}
async function complete(){
  const c = cfg();
  if (T.phase === "work") {
    await logSession(Math.round(T.total / 60e3));
    T.n = (T.n || 0) + 1;
    const long = T.n % c.every === 0, mins = long ? c.longBrk : c.brk;
    T.phase = "break"; T.long = long; T.total = mins * 60e3; T.endAt = now() + T.total; T.eyeAt = null; save();
    beep("done"); notify(t("专注完成，休息 {n} 分钟", { n: mins }), long ? t("第 {n} 段 · 长休息：起来走走、喝口水", { n: T.n }) : t("第 {n} 段 · 离开屏幕几分钟", { n: T.n }));
    paint(); render();
  } else if (T.phase === "break") {
    T.phase = "ready"; save(); beep("back"); notify(t("休息结束"), t("准备好了就开始下一段"));
    if (c.autoNext) start(); else paint();
  } else if (T.phase === "eye") endEye();
}
async function logSession(minutes){
  if (!S.wb.loaded) { toast(t("没登录，这段专注没有记录")); return; }
  try {
    // 没有“专注”习惯就建一个（每天 4 段的目标，可在习惯里改），这段才有地方记
    let p = (T.practiceId && wb.practice(T.practiceId)) || wb.firstOfKind("focus");
    if (!p) p = await wb.upsertPractice({ kind: "focus", name: "", schedule: { days: [1, 2, 3, 4, 5], times: [], remind: false }, target: { per: "day", count: 4 } });
    T.practiceId = p.id; save();
    await wb.addLog("focus", p.id, { minutes, task: T.task || "", eyes: T.eyes || 0 }, S.day);   // 专注计时永远记到真正的今天，不跟“补记”选的日子走
  } catch (e) { /* run() already toasted */ }
}
function tick(){
  if (T.pausedLeft != null || !["work", "eye", "break"].includes(T.phase)) { title(); return; }
  if (T.phase === "work" && T.eyeAt && now() >= T.eyeAt) { startEye(); return; }
  if (now() >= T.endAt) { complete(); return; }
  paintTime(); title();
}
setInterval(tick, 500);
// 页面重新可见时立刻对一次表（后台时 setInterval 会被放慢）
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });

/* ---- 提示：标题、声音、通知、震动 ---- */
const baseTitle = () => t("牧羊人") + " · " + t("身心灵记录");
function title(){ document.title = ["work", "eye", "break"].includes(T.phase) ? `${mmss(leftMs())} ${phaseLabel()} · ${t("牧羊人")}` : baseTitle(); }
let audio = null;
function unlockAudio(){ try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) {} }
function beep(kind){
  if (!cfg().sound) return;
  try { navigator.vibrate && navigator.vibrate(kind === "done" ? [200, 100, 200] : [120]); } catch (e) {}
  if (!audio) return;
  const seq = kind === "done" ? [[660, 0], [880, .18], [1100, .36]] : kind === "eye" ? [[520, 0], [520, .25]] : [[780, 0]];
  for (const [f, at] of seq) {
    const o = audio.createOscillator(), g = audio.createGain(); o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, audio.currentTime + at); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + .02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + .16);
    o.connect(g).connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + .2);
  }
}
function notify(body, extra){
  if (!cfg().notify || !("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(t("牧羊人") + " · " + body, { body: extra || "", tag: "shepherd-focus", silent: true }); } catch (e) {}
}
async function askNotify(){
  if (!("Notification" in window)) { toast(t("这个浏览器不支持桌面通知")); return; }
  const p = await Notification.requestPermission();
  if (p === "granted") { await setCfg({ notify: true }); toast(t("桌面通知已开启")); } else toast(t("浏览器没有允许通知"));
  openFocus();
}

/* ---- 护眼浮层：全屏、平静、倒计时，哪一页都看得见 ---- */
function showEye(){
  let el = $("#eye");
  if (!el) { el = document.createElement("div"); el.id = "eye"; el.className = "eye"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", t("护眼")); document.body.appendChild(el); }
  el.innerHTML = `<div class="eye-in"><div class="eye-icon" aria-hidden="true">👀</div><div class="eye-title">${t("看远处")}</div><div class="eye-sub">${t("眨眨眼，看 6 米以外的东西，让眼睛松一松")}</div><div class="eye-time num" id="eye-time">${Math.ceil(leftMs() / 1000)}</div><button class="btn" data-act="fz-skip">${t("好了，继续")}</button></div>`;
}
function hideEye(){ const el = $("#eye"); if (el) el.remove(); }

/* ---- 计时页 ---- */
const phaseLabel = () => ({ work: t("专注"), eye: t("护眼"), break: T.long ? t("长休息") : t("休息"), ready: t("休息结束"), idle: t("准备") })[T.phase] || "";
function openFocus(pid){
  if (pid) T.practiceId = pid;
  const c = cfg();
  const chip = (k, v, label) => `<button class="chip" data-act="fz-cfg" data-k="${k}" data-v="${v}" aria-pressed="${String(c[k]) === String(v)}">${label}</button>`;
  const mins = vals => vals.map(v => [v, `${v}`]);
  const p = wb.firstOfKind && S.wb.loaded ? (wb.practice(T.practiceId) || wb.firstOfKind("focus")) : null;
  const st = p ? wb.statusOf(p) : null;
  $("#sheetIn").innerHTML = `${head(t("专注计时"))}
  <div class="fz" id="fz"></div>
  <p class="small muted" style="text-align:center">${st ? t("今天 {n} 段 · {m} 分钟", { n: st.sessions, m: st.minutes }) + ((p.target || {}).count ? ` / ${t("{n} 段", { n: p.target.count })}` : "") : (S.wb.loaded ? t("还没有“专注”习惯：完成的段会记在自动创建的一项上，可在回顾里看趋势。") : t("登录后完成的段会自动记录。"))}</p>
  <h2>${t("设置")}</h2>
  <div class="panel">
    <div class="fz-row"><span class="lab">${t("专注")}</span><span class="chips" style="margin:0">${mins([15, 25, 30, 45, 50, 90]).map(([v, l]) => chip("work", v, l + " " + t("分钟"))).join("")}</span></div>
    <div class="fz-row"><span class="lab">${t("休息")}</span><span class="chips" style="margin:0">${mins([3, 5, 10]).map(([v, l]) => chip("brk", v, l)).join("")}<span class="small muted" style="align-self:center;margin-left:6px">${t("长休息")}</span>${mins([15, 20, 30]).map(([v, l]) => chip("longBrk", v, l)).join("")}<span class="small muted" style="align-self:center;margin-left:6px">${t("每")}</span>${mins([2, 3, 4]).map(([v, l]) => chip("every", v, l + " " + t("段"))).join("")}</span></div>
    <div class="fz-row"><span class="lab">${t("护眼")}</span><span class="chips" style="margin:0">${chip("eye", true, t("开"))}${chip("eye", false, t("关"))}<span class="small muted" style="align-self:center;margin-left:6px">${t("每")}</span>${mins([15, 20, 30]).map(([v, l]) => chip("eyeEvery", v, l + " " + t("分钟"))).join("")}<span class="small muted" style="align-self:center;margin-left:6px">${t("看远处")}</span>${mins([20, 30, 60]).map(([v, l]) => chip("eyeSecs", v, l + " " + t("秒"))).join("")}</span></div>
    <div class="fz-row"><span class="lab">${t("提醒")}</span><span class="chips" style="margin:0">${chip("sound", true, t("声音开"))}${chip("sound", false, t("声音关"))}<button class="chip" data-act="fz-notify" aria-pressed="${!!c.notify && ("Notification" in window) && Notification.permission === "granted"}">${t("桌面通知")}</button>${chip("autoNext", true, t("休息完自动开始下一段"))}${chip("autoNext", false, t("休息完等我点"))}</span></div>
    <p class="small muted" style="margin-top:8px">${t("护眼按 20-20-20 法则：每 20 分钟看 6 米（20 英尺）以外 20 秒，专注时间顺延。页面要保持打开（可以切到别的标签页，标题会显示倒计时）；手机锁屏后计时继续，但提示音要回到页面才响。")}</p>
  </div>
  <h2>${t("怎么练专注")}</h2>
  <div class="panel"><ul class="plain small" style="margin:0">
    <li>${t("先从 25 分钟开始，一周里大多数天都能完成 4 段，再加到 30、45 分钟。")}</li>
    <li>${t("开始前写一句“在做什么”，一段只做这一件事；手机放到另一个房间。")}</li>
    <li>${t("中途被打断就点“结束”，超过 1 分钟的部分照样记下来，不必从头来过。")}</li>
    <li>${t("回顾页能看到每天的段数和分钟，连续几天稳定了再加长。")}</li>
  </ul></div>`;
  paint(); showSheet();
}
// 只重画计时区：倒计时数字每半秒变，按钮按阶段变
function paint(){
  const box = $("#fz"); if (!box) return;
  const left = leftMs(), total = T.total || 1, frac = ["work", "eye", "break"].includes(T.phase) ? 1 - left / total : 0;
  const R = 54, C = 2 * Math.PI * R;
  const color = T.phase === "eye" ? "var(--sage)" : T.phase === "break" ? "var(--sky)" : "var(--rose)";
  const btns = T.phase === "idle" || T.phase === "ready"
    ? `<button class="btn primary" data-act="fz-start">${T.phase === "ready" ? t("开始下一段") : t("开始专注")}</button>${T.n ? `<button class="btn" data-act="fz-reset">${t("清零")}</button>` : ""}`
    : `${T.pausedLeft != null ? `<button class="btn primary" data-act="fz-resume">${t("继续")}</button>` : `<button class="btn" data-act="fz-pause">${t("暂停")}</button>`}${T.phase === "break" ? `<button class="btn" data-act="fz-skip">${t("跳过休息")}</button>` : T.phase === "eye" ? `<button class="btn" data-act="fz-skip">${t("好了，继续")}</button>` : ""}<button class="btn danger" data-act="fz-stop">${t("结束")}</button>`;
  box.innerHTML = `<div class="fz-phase" id="fz-phase">${esc(phaseLabel())}${T.phase !== "idle" ? ` · ${t("第 {n} 段", { n: (T.n || 0) + (T.phase === "work" || T.phase === "eye" ? 1 : 0) })}` : ""}${T.pausedLeft != null ? ` · ${t("已暂停")}` : ""}</div>
    <div class="fz-ring"><svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--line)" stroke-width="6"/><circle id="fz-arc" cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}" transform="rotate(-90 60 60)"/></svg><div class="fz-time num" id="fz-time">${T.phase === "idle" ? mmss(cfg().work * 60e3) : T.phase === "ready" ? mmss(cfg().work * 60e3) : mmss(left)}</div></div>
    <div class="field" style="margin:8px 0 0"><input id="fz-task" type="text" placeholder="${t("在做什么（可空）")}" value="${esc(T.task || "")}" autocomplete="off"></div>
    <div class="btns" style="justify-content:center">${btns}</div>
    <p class="small muted" style="text-align:center;margin-top:6px">${T.n ? t("今天这轮已完成 {n} 段", { n: T.n }) : ""}${T.eyes ? ` · ${t("护眼 {n} 次", { n: T.eyes })}` : ""}</p>`;
}
function paintTime(){
  const el = $("#fz-time"); if (el) { el.textContent = mmss(leftMs()); const arc = $("#fz-arc"); if (arc) { const C = 2 * Math.PI * 54, frac = 1 - leftMs() / (T.total || 1); arc.setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(1)); } }
  const e = $("#eye-time"); if (e) e.textContent = Math.ceil(leftMs() / 1000);
}
document.addEventListener("input", ev => { if (ev.target && ev.target.id === "fz-task") { T.task = ev.target.value; save(); } });

// 刷新页面后：护眼中要把浮层画回来
if (T.phase === "eye") showEye();

export { openFocus, start, pause, resume, stop, skip, reset, setCfg, askNotify, cfg as focusCfg };
