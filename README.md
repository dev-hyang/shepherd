# 牧羊人 · 身心灵记录

大人自己的记录：读经、祷告、锻炼、健康饮食、屏幕时长、用药与保健品，带提醒和趋势。
和 [小月亮](https://dev-hyang.github.io/baby-log/)（孩子）、[家庭学堂](https://dev-hyang.github.io/homeschool/)（教育）、[爱家小助手](https://dev-hyang.github.io/home-pantry/)（家务）是同一个账号、同一个家庭。

线上：https://dev-hyang.github.io/shepherd/

## 原则

- **默认只有自己看得到。** 每条记录挂在你的账号上；一项习惯可以单独设为"家人可见"，配偶只看到做了没有、分钟数和备注。祷告清单的内容永远只有自己。
- **不给灵修打分。** 读经和祷告只显示连续性，没有分数、排行。
- **按进度不按日期。** 读经计划读完一段才前进，漏了几天不会堆积成压力。
- **提醒交给手机日历。** 订阅一个链接，习惯按时间点进日历、到点响铃，不用装任何东西。
- **少记一点。** 屏幕时长一个数、饮食三档，锻炼只记类型和分钟，不做热量库。

## 结构

静态站，ES 模块，无构建；GitHub Pages 从 `main` 根目录发布。

| 文件 | 内容 |
|---|---|
| `index.html` | 壳：标题、姊妹应用切换、四个页签、表单页、toast |
| `app.css` | 样式；米白底 + 橄榄绿，组件和小月亮 / 学堂一致 |
| `js/app.js` | 启动；版本不一致时强制刷新模块缓存 |
| `js/core/config.js` | Supabase 地址与公开 key、Edge Function 地址、版本号、姊妹站点 |
| `js/core/auth.js` | 登录、匿名账号绑定邮箱、家庭与成员（读小月亮的表） |
| `js/core/state.js` `util.js` `i18n.js` | 状态、helpers、简 / 繁 / 英 |
| `js/wb.js` | 数据层：wb_* 表的读写、打卡状态、周目标、连续天数、读经计划、家人共享 |
| `js/today.js` `prayer.js` `review.js` `me.js` | 四个页签 |
| `js/sheet.js` | 整页表单引擎、习惯编辑、习惯列表、读经计划、日历订阅、设置 |
| `js/events.js` | 事件分发 |
| `js/data/kinds.js` | 习惯种类、打卡方式、起步模板 |
| `js/data/plans.js` | 内置读经计划（按章自动生成）与导入解析 |
| `js/data/bible.js` | 书卷表、出处解析、经文抓取（和学堂同源，加了整章抓取） |
| `js/data/i18n-en.js` `s2t.js` | 英文字典、简繁字表 |

## 数据库

表 `wb_profile` `wb_practices` `wb_logs` `wb_prayers`，建表脚本在 baby-log 仓库本机的 `supabase/migrations/013_shepherd.sql`（不进 git），在 Supabase SQL Editor 里执行一次。
行级权限：本人读写；`share = 'family'` 的习惯和打卡，家庭成员只读。

## 日历订阅

Edge Function 源码在本仓库 `supabase/functions/ics/index.ts`（不含密钥，可公开）。事件标题跟随网页里选的界面语言（简 / 繁 / 英）。部署（在仓库根目录，装好并登录 Supabase CLI 后）：

```
supabase functions deploy ics --project-ref <项目 ref> --no-verify-jwt
```

本机的 CLI 装在同级目录 `supabase-cli/node_modules/.bin/supabase.cmd`（npm 包）；换电脑时重新 `npm install supabase --save-dev --registry https://registry.npmjs.org/` 并 `supabase login` 即可。

网页 → 我的 → 日历订阅提醒 里拿链接，手机日历订阅即可；钥匙可随时换。

## 本地预览

```
python -m http.server 8766
```

打开 http://localhost:8766/ 。登录用和小月亮一样的账号。
