/* ============ 界面语言：简体 / 繁體 / English（与家庭学堂同一套做法） ============
   源码里的界面文字一律写简体中文，并用 t("…") 包起来；简体就是字典的键。
   - English：查 data/i18n-en.js，查不到就原样显示简体（不会报错）。
   - 繁體：先按 TW_PHRASES 换词，再按 data/s2t.js 逐字转换，所以不需要维护第二份字典。
   - 用户自己录入的内容（习惯名、祷告事项、备注……）不经过 t()，按输入原样显示；tc() 只给应用自带的内容做繁体转换。 */
import { LS_PREFIX } from "./config.js";
import { s2tChars } from "../data/s2t.js";
import { EN } from "../data/i18n-en.js";

const LOCALES = [["zh-CN", "简体"], ["zh-TW", "繁體"], ["en", "English"]];
const KEY = LS_PREFIX + ".locale";
let cur = "zh-CN";
try { const v = localStorage.getItem(KEY) || localStorage.getItem("homeschool.v1.locale"); if (v && LOCALES.some(l => l[0] === v)) cur = v; } catch (e) {}

const TW_PHRASES = [
  ["数据库", "資料庫"], ["服务器", "伺服器"], ["读经计划", "讀經計畫"], ["计划", "計畫"], ["设置", "設定"], ["干净", "乾淨"],
  ["视频", "影片"], ["默认", "預設"], ["网络", "網路"], ["软件", "軟體"], ["登录", "登入"], ["账号", "帳號"],
  ["信息", "資訊"], ["界面", "介面"], ["支持", "支援"], ["链接", "連結"], ["邮箱", "電子郵件"], ["密码", "密碼"], ["刷新", "重新整理"], ["退出", "登出"],
  ["保存", "儲存"], ["程序", "程式"], ["质量", "品質"], ["屏幕", "螢幕"], ["锻炼", "鍛鍊"], ["注册", "註冊"], ["搜索", "搜尋"], ["粘贴", "貼上"], ["复制", "複製"],
  ["导出", "匯出"], ["导入", "匯入"], ["出处", "出處"], ["云端", "雲端"], ["日历", "日曆"], ["分钟", "分鐘"], ["订阅", "訂閱"]
].sort((a, b) => b[0].length - a[0].length);
const twCache = new Map();
function s2t(s){
  s = String(s); if (twCache.has(s)) return twCache.get(s);
  let o = s; for (const [a, b] of TW_PHRASES) if (o.includes(a)) o = o.split(a).join(b);
  o = o.replace(/周(?=[一二三四五六日数末例]|[\s）)，。、]|$)/g, "週");
  o = s2tChars(o); twCache.set(s, o); return o;
}
function t(key, vars){
  let s = String(key);
  if (cur === "en") { const v = EN[s]; if (v != null) s = v; }
  else if (cur === "zh-TW") s = s2t(s);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
const tc = text => cur === "zh-TW" ? s2t(text) : String(text ?? "");
function locale(){ return cur; }
function setLocale(l){ if (!LOCALES.some(x => x[0] === l)) return; cur = l; try { localStorage.setItem(KEY, l); } catch (e) {} applyLang(); }
function applyLang(){ document.documentElement.lang = cur; document.title = t("牧羊人") + " · " + t("身心灵记录"); }
applyLang();

export { LOCALES, t, tc, locale, setLocale, s2t };
