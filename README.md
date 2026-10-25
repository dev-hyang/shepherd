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
- **专注与护眼。** 番茄计时（默认 25 / 5，每 4 段长休息），专注中每 20 分钟弹一次看远处 20 秒；页面标题倒计时、提示音、可选桌面通知。

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
| `js/focus.js` | 专注计时：番茄工作法 + 20-20-20 护眼浮层，完成的段自动记为 focus 打卡 |
| `js/tk.js` `js/tasks.js` `js/recur.js` `js/data/taskcats.js` | 任务：数据层（wb_tasks、完成记进 wb_logs）、任务页（今天 / 计划 日周月 / 清单 / 已完成）、重复与一句话解析、默认分类；设计见 `docs/design-tasks.md` |
| `js/ui.js` | 共用版式：区块标题 secHead、页面标题 pageHead、筛选栏 fbar（“筛选 ▾”按钮 + 搜索 + 新增，下拉面板里是各组选项，已选的显示成可点掉的小标签） |
| `js/nt.js` `js/notes.js` `js/notes-lib.js` `js/markdown.js` `js/ai.js` | 灵修笔记：数据层（wb_notes，自己的 + 家人分享给我的）、界面（记 / 拍照识字点选 / 筛选搜索 / 导出打印 / AI 整理 / AI 设置）、纯逻辑（筛选、分组、导出 Markdown、OCR 解析、提示词）、轻量 Markdown 渲染（心得栏：先转义再加标签，不支持原始 HTML；`tests/` 里有单测）、AI 调用层（自带 key、浏览器直连，和爱家小助手同一套思路） |
| `js/data/kinds.js` | 习惯种类、打卡方式、起步模板 |
| `js/data/plans.js` | 内置读经计划（按章自动生成）与导入解析 |
| `js/data/bible.js` | 书卷表、出处解析、经文抓取（和学堂同源，加了整章抓取） |
| `js/data/i18n-en.js` `s2t.js` | 英文字典、简繁字表 |

## 数据库

表 `wb_profile` `wb_practices` `wb_logs` `wb_prayers`，建表脚本在 baby-log 仓库本机的 `supabase/migrations/013_shepherd.sql`（不进 git），在 Supabase SQL Editor 里执行一次。
任务表 `wb_tasks`：脚本在本仓库 `docs/015_shepherd_tasks.sql`，在 Supabase SQL Editor 里执行一次（可重复执行）；没执行时只有“任务”页签提示，其余功能照常。日历订阅要带上任务，需要重新部署一次 `ics` 函数（命令见下）。
灵修笔记表 `wb_notes`：脚本在本仓库 `docs/016_shepherd_notes.sql`，在 Supabase SQL Editor 里执行一次（可重复执行）；没执行时只有笔记页提示，其余功能照常。每条默认只有本人；可逐条分享给家庭里指定的成员（`shared_with`，对方只读，守卫触发器会丢掉不是同一家庭的 id）。
AI（拍照识字、整理笔记）：用户自己的 key 存在本机 localStorage，浏览器直连服务商，不经任何服务器；爱家小助手里已填的 key 直接沿用。照片压缩后只在内存里发出去，不保存，数据库里只有用户选定的文字。
测试：`node --test tests/*.test.mjs`（纯逻辑和 AI 调用层，不需要网络）。
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

## 云盘备份

> 详细的设置步骤（Google Drive 的 Client ID / API Key、Dropbox 的 App key 和 Redirect URI、本地文件夹、数据库重建、排错）见 [docs/backup-and-sync.md](docs/backup-and-sync.md)。

「我的 → 备份与恢复」可以把牧羊人的数据定时备份到 Google Drive / Dropbox（手机电脑都能用）、电脑上的云盘同步文件夹、共用 Supabase 项目的存储（baby-log 迁移 017）或直接下载。Google Drive / Dropbox 要在 `js/core/config.js` 填两个公开的客户端标识（不是密钥）：

- Google Drive：Google Cloud Console → APIs & Services → 启用 Google Drive API → OAuth 2.0 客户端（类型 Web 应用），「已获授权的 JavaScript 来源」填站点地址，Client ID 填到 `GOOGLE_CLIENT_ID`。权限只有 drive.file（只看得到这个应用自己建的文件）。
- Dropbox：Dropbox App Console → Create app → Scoped access，Access type 选 **App folder**，Permissions 勾 `files.content.write` / `files.content.read` / `account_info.read`，Redirect URIs 填站点地址（带结尾的 /），App key 填到 `DROPBOX_APP_KEY`。
- 备份放在卡片里填的路径下：Drive 默认「牧羊人备份」（可多级，不存在就逐级建）；Dropbox 是应用文件夹里的子路径。令牌存本机 localStorage，「断开」会吊销并清掉。代码在 `js/cloud-drives.js`，四个应用共用同一份。
