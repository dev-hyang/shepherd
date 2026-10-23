// 牧羊人 · 日历订阅（Supabase Edge Function）
// 为什么需要：网页推送在 iPhone 上要先加到主屏幕、还要一台服务器定时发；日历订阅只要一个链接，手机自带日历到点响铃。
// 这个函数按链接里的钥匙（wb_profile.ics_token）找到人，把开了提醒的习惯按时间点生成一份 iCalendar（.ics）。
// 事件标题和说明跟随网页里选的界面语言（wb_profile.settings.lang：zh-CN / zh-TW / en，网页每次加载时同步）。
//
// 部署（装好 Supabase CLI 并 supabase login 后，在本仓库根目录执行）：
//   supabase functions deploy ics --project-ref <项目 ref> --no-verify-jwt
//   （日历应用不会带 JWT，所以必须 --no-verify-jwt；安全靠钥匙：16 字节随机数，网页里可随时换。）
//   不需要额外 secrets：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入。这个文件不含任何密钥。
// 网页里的链接：https://<项目 ref>.supabase.co/functions/v1/ics?t=<钥匙>（webcal:// 同一个地址）
//
// 时间写成"浮动时间"（不带时区）：07:00 就是手机所在时区的 07:00，出差换时区也跟着走，正合习惯提醒的意思。
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
const KIND_ICON: Record<string, string> = { scripture: "📖", prayer: "🕊", exercise: "🏃", diet: "🥗", screen: "📱", sleep: "🌙", med: "💊", supplement: "🌿", focus: "🍅", custom: "✦" };
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/* 三种语言的文字；名字留空的习惯按种类显示 */
type Text = { cal: string; desc: string; kinds: Record<string, string>; dose: string; minutes: (m: number) => string; from: string; refill: string; left: (d: number, s: number, dose: string) => string };
const TEXT: Record<string, Text> = {
  "zh-CN": { cal: "牧羊人", desc: "牧羊人 · 身心灵记录的提醒", kinds: { scripture: "读经", prayer: "祷告", exercise: "锻炼", diet: "健康饮食", screen: "屏幕时长", sleep: "睡眠", med: "用药", supplement: "保健品", focus: "专注", custom: "习惯" },
    dose: "剂量：", minutes: m => `约 ${m} 分钟`, from: "来自牧羊人", refill: "补货：", left: (d, s, dose) => `还剩约 ${d} 天的量（${s}${dose ? " × " + dose : ""}）` },
  "zh-TW": { cal: "牧羊人", desc: "牧羊人 · 身心靈記錄的提醒", kinds: { scripture: "讀經", prayer: "禱告", exercise: "鍛鍊", diet: "健康飲食", screen: "螢幕時長", sleep: "睡眠", med: "用藥", supplement: "保健品", focus: "專注", custom: "習慣" },
    dose: "劑量：", minutes: m => `約 ${m} 分鐘`, from: "來自牧羊人", refill: "補貨：", left: (d, s, dose) => `還剩約 ${d} 天的量（${s}${dose ? " × " + dose : ""}）` },
  "en": { cal: "Shepherd", desc: "Shepherd · body, mind & spirit reminders", kinds: { scripture: "Bible", prayer: "Prayer", exercise: "Exercise", diet: "Healthy eating", screen: "Screen time", sleep: "Sleep", med: "Medication", supplement: "Supplement", focus: "Focus", custom: "Habit" },
    dose: "Dose: ", minutes: m => `about ${m} min`, from: "From Shepherd", refill: "Restock: ", left: (d, s, dose) => `About ${d} days left (${s}${dose ? " × " + dose : ""})` }
};
const textFor = (lang: unknown) => TEXT[typeof lang === "string" && lang in TEXT ? lang : "zh-CN"];

type Practice = { id: string; kind: string; name: string; target: Record<string, unknown>; schedule: { days?: number[]; times?: string[]; remind?: boolean }; meta: { dose?: string; stock?: number | string; refillAt?: number } };

const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545：每行最多 75 字节，超出的折到下一行并以一个空格开头（按字节折，别把多字节字符切开）
function fold(line: string): string {
  const enc = new TextEncoder(), bytes = enc.encode(line); if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = "", curBytes = 0;
  for (const ch of line) { const n = enc.encode(ch).length; if (curBytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = " " + ch; curBytes = 1 + n; } else { cur += ch; curBytes += n; } }
  out.push(cur); return out.join("\r\n");
}
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const uid = (s: string) => `${s}@shepherd.dev-hyang`;

/* ---- 任务（wb_tasks，迁移 015）：有日期的未完成任务 / 事件进日历 ----
   只放“某一天”的（period = day）；有开始时间的是定时事件，没有的是全天事件，早上 allDayAt 响一次。
   重复规则映射成 RRULE；“完成后再算”的（after）只放当前这一次。已完成的单次任务不会出现（订阅每 4 小时刷新，最多晚这么久）。
   remind 是提前几分钟的数组；nag 的再加两个：到点后 15、60 分钟。 */
type Task = { id: string; kind: string; title: string; note: string; period: string; due: string | null; start_time: string | null; dur: number | null;
  recur: { freq?: string; every?: number; days?: number[]; mday?: number; until?: string; after?: boolean } | null; remind: number[]; nag: boolean };
const RFREQ: Record<string, string> = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };
function taskEvents(tasks: Task[], T: Text, now: Date, allDayAt: string): string[] {
  const out: string[] = [], today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const [ah, am] = /^\d{2}:\d{2}$/.test(allDayAt) ? allDayAt.split(":").map(Number) : [9, 0];
  for (const tk of tasks) {
    if (!tk.due || (tk.period ?? "day") !== "day" || !tk.title) continue;
    const r = tk.recur && !tk.recur.after && tk.recur.freq && RFREQ[tk.recur.freq] ? tk.recur : null;
    if (!r && tk.due < today) continue;               // 过了期的单次任务：日历里响也没用，网页里催
    const dd = tk.due.replace(/-/g, ""), timed = !!tk.start_time && /^\d{2}:\d{2}$/.test(tk.start_time);
    const icon = tk.kind === "event" ? "📅" : "☐", title = `${icon} ${tk.title}`;
    out.push("BEGIN:VEVENT", `UID:${uid("task-" + tk.id)}`, `DTSTAMP:${stamp(now)}`);
    if (timed) { const [h, m] = tk.start_time!.split(":"); out.push(`DTSTART:${dd}T${h}${m}00`, `DURATION:PT${Math.max(5, Math.min(600, tk.dur || 30))}M`); }
    else out.push(`DTSTART;VALUE=DATE:${dd}`);
    if (r) {
      const parts = [`FREQ=${RFREQ[r.freq!]}`, `INTERVAL=${Math.max(1, Number(r.every) || 1)}`];
      if (r.freq === "week" && Array.isArray(r.days) && r.days.length) parts.push(`BYDAY=${r.days.map(d => BYDAY[d]).join(",")}`);
      if (r.freq === "month" && r.mday) parts.push(`BYMONTHDAY=${Number(r.mday)}`);
      if (r.until && /^\d{4}-\d{2}-\d{2}$/.test(r.until)) parts.push(`UNTIL=${r.until.replace(/-/g, "")}${timed ? "T235959" : ""}`);
      out.push(`RRULE:${parts.join(";")}`);
    }
    out.push(`SUMMARY:${esc(title)}`, `DESCRIPTION:${esc([tk.note, `${T.from} https://dev-hyang.github.io/shepherd/`].filter(Boolean).join("\n"))}`, `TRANSP:${tk.kind === "event" ? "OPAQUE" : "TRANSPARENT"}`);
    const alarm = (trigger: string) => out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, `TRIGGER:${trigger}`, "END:VALARM");
    const offs = Array.isArray(tk.remind) ? tk.remind.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 20160) : [];
    for (const m of offs) timed ? alarm(m ? `-PT${m}M` : "PT0M") : alarm(`PT${ah}H${am}M`);
    if (tk.nag && (offs.length || timed)) for (const m of [15, 60]) alarm(timed ? `PT${m}M` : `PT${ah * 60 + am + m}M`);
    out.push("END:VEVENT");
  }
  return out;
}

function build(p: Practice[], T: Text, tasks: Task[] = [], allDayAt = "09:00"): string {
  const now = new Date(), today = ymd(now), lines: string[] = [];
  lines.push("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//dev-hyang//shepherd//ZH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(T.cal)}`, `X-WR-CALDESC:${esc(T.desc)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT4H", "X-PUBLISHED-TTL:PT4H");
  for (const pr of p) {
    const sc = pr.schedule ?? {}, times = (sc.times ?? []).filter(t => /^\d{2}:\d{2}$/.test(t));
    const icon = KIND_ICON[pr.kind] ?? "✦", label = pr.name || T.kinds[pr.kind] || pr.kind, title = `${icon} ${label}`;
    const days = Array.isArray(sc.days) && sc.days.length && sc.days.length < 7 ? sc.days : null;
    const rrule = days ? `RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => BYDAY[d]).join(",")}` : "RRULE:FREQ=DAILY";
    const minutes = Number((pr.target as Record<string, unknown>)?.minutes) || 0;
    const desc = [pr.meta?.dose ? T.dose + pr.meta.dose : "", minutes ? T.minutes(minutes) : "", `${T.from} https://dev-hyang.github.io/shepherd/`].filter(Boolean).join("\n");
    if (sc.remind !== false) for (const tm of times) {
      const [h, m] = tm.split(":");
      // 如果今天的这个时间已过，RRULE 仍从今天起算也没关系：日历只显示未来的实例
      lines.push("BEGIN:VEVENT", `UID:${uid(pr.id + "-" + tm.replace(":", ""))}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${today}T${h}${m}00`, `DURATION:PT${Math.max(5, Math.min(120, minutes || 15))}M`, rrule,
        `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, "TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    }
    // 用药 / 保健品：库存按每天几次折算成"还能吃几天"，提前 refillAt 天放一个全天事件提醒补货
    const stock = Number(pr.meta?.stock);
    if ((pr.kind === "med" || pr.kind === "supplement") && Number.isFinite(stock) && stock >= 0 && times.length) {
      const perWeek = times.length * (days ? days.length : 7), perDay = perWeek / 7;
      if (perDay > 0) {
        const daysLeft = Math.floor(stock / perDay), lead = Number(pr.meta?.refillAt) || 7;
        const at = new Date(now.getTime() + Math.max(0, daysLeft - lead) * 864e5);
        lines.push("BEGIN:VEVENT", `UID:${uid(pr.id + "-refill")}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(at)}`,
          `SUMMARY:${esc(`🛒 ${T.refill}${label}`)}`, `DESCRIPTION:${esc(T.left(daysLeft, stock, pr.meta?.dose ?? ""))}`,
          "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(T.refill + label)}`, "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
      }
    }
  }
  lines.push(...taskEvents(tasks, T, now, allDayAt));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const u = new URL(req.url), t = u.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{16,64}$/i.test(t)) return new Response("not found", { status: 404 });
  const prof = await sb.from("wb_profile").select("user_id, settings").eq("ics_token", t).maybeSingle();
  if (prof.error || !prof.data) return new Response("not found", { status: 404 });
  const pr = await sb.from("wb_practices").select("id, kind, name, target, schedule, meta").eq("user_id", prof.data.user_id).eq("active", true).eq("archived", false).order("sort");
  if (pr.error) return new Response("error", { status: 500 });
  // 任务表（迁移 015）还没建、或查询失败时只是少了任务，习惯照常
  const tk = await sb.from("wb_tasks").select("id, kind, title, note, period, due, start_time, dur, recur, remind, nag").eq("user_id", prof.data.user_id).eq("status", "open").not("due", "is", null);
  const st = (prof.data.settings ?? {}) as Record<string, unknown>, nudge = (st.nudge ?? {}) as Record<string, unknown>;
  const body = build((pr.data ?? []) as Practice[], textFor(st.lang), tk.error ? [] : (tk.data ?? []) as Task[], typeof nudge.allDayAt === "string" ? nudge.allDayAt : "09:00");
  return new Response(body, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="shepherd.ics"', "cache-control": "private, max-age=600" } });
});
