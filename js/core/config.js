/* ============ 云端配置（与小月亮、家庭学堂共用同一个 Supabase 项目） ============
   只能填 anon / publishable 公开 key（设计上就是给浏览器用的，安全靠数据库的行级权限 RLS）。
   绝对不要填 service_role / secret key。四个站点都在 dev-hyang.github.io 下，登录会话自动共享。 */
const SUPABASE_URL = "https://gbhvqlraimmignhoczww.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiaHZxbHJhaW1taWduaG9jend3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODY5MzAsImV4cCI6MjEwNzM2MjkzMH0.Y9ZzQKGChGqnLj-69Bnljgb8BVgXbOEuHbbKt6Z5bBE";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
// 日历订阅：Supabase Edge Function（源码在本仓库 supabase/functions/ics/index.ts，部署步骤见文件头）
const ICS_FUNCTION = SUPABASE_URL + "/functions/v1/ics";

const LS_PREFIX = "shepherd.v1";              // 本设备偏好的 localStorage 前缀
const APP_VERSION = "2026-10-22.2";
const BABY_LOG_URL = "https://dev-hyang.github.io/baby-log/";
// 四个姊妹站点同一个账号同一个家庭；标题旁的左右箭头在它们之间切换（按这里的顺序环绕）
const SISTER_APPS = [
  { id: "baby-log", name: "小月亮", short: "小月亮", url: BABY_LOG_URL, desc: "宝宝记录：喂奶、睡眠、尿布、成长曲线。家庭、家人和孩子在这里维护。" },
  { id: "homeschool", name: "家庭学堂", short: "学堂", url: "https://dev-hyang.github.io/homeschool/", desc: "在家教育：每日敬拜、经文背诵、课程、任务与报告。" },
  { id: "home-pantry", name: "爱家小助手", short: "小助手", url: "https://dev-hyang.github.io/home-pantry/", desc: "家庭库存与采购清单、按库存推荐三餐、房屋维护与装备清单。" },
  { id: "shepherd", name: "牧羊人", short: "牧羊人", url: "https://dev-hyang.github.io/shepherd/", desc: "大人自己的身心灵记录：读经、祷告、锻炼、饮食、屏幕时长、用药与保健品，提醒与趋势。" }
];
const THIS_APP = "shepherd";

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS, ICS_FUNCTION, LS_PREFIX, APP_VERSION, BABY_LOG_URL, SISTER_APPS, THIS_APP };
