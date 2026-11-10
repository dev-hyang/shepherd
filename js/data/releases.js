/* ============ 发布日志的数据（我的 → 发布日志；新版本时今天页顶上提示几次） ============
   每次推送：升 APP_VERSION（js/core/config.js）并在最前面加一条，v 必须和 APP_VERSION 一样，否则今天页不提示。
   写给家人看的话：标题一句话，要点 1–4 条、每条一句，不写技术词。k：new 新功能 / better 改进 / fix 修复。
   页面和样式在 js/releases-ui.js（四个姊妹应用共用，别单独改）。 */
export const RELEASES = [
  { v: "2026-11-09.2", title: { zh: "记录的日期不能选到未来", en: "Record dates can no longer be in the future" }, items: [
    { k: "better", zh: "就诊、化验、测量、训练记录和笔记的日期：晚于今天的变灰、不能选", en: "Dates for visits, labs, measurements, workouts and notes: anything after today is greyed out" },
    { k: "better", zh: "待办日期、复诊日期、提醒时间不受影响，照样能选未来", en: "Task dates, follow-up dates and reminder times are unchanged and can still be in the future" }
  ] },
  { v: "2026-11-09.1", title: { zh: "填表时没保存的内容不会再被自动刷新冲掉", en: "Unsaved typing no longer gets wiped by auto-refresh" }, items: [
    { k: "fix", zh: "家人那边有更新、切回页面或过了午夜时，正在输入的文字和光标位置都会保留", en: "When family updates arrive, you return to the app or it passes midnight, what you're typing and the cursor stay put" },
    { k: "fix", zh: "专注计时到点换阶段时，“在做什么”输入框不再丢失光标", en: "The focus timer's \"what are you working on\" box keeps the cursor when a phase ends" }
  ] },
  { v: "2026-11-08.2", title: { zh: "发布日志可以按天或按版本分组，补上了早期的更新记录", en: "Group release notes by day or version, plus the full early history" }, items: [
    { k: "new", zh: "发布日志新增「分组」：按版本或按天，记住你的选择", en: "Release notes can be grouped by version or by day, and remember your choice" },
    { k: "better", zh: "补上了从上线第一天起的更新记录", en: "Every update since day one is now in the release notes" }
  ] },
  { v: "2026-11-08.1", title: { zh: "新增「发布日志」：每次更新了什么", en: "New release notes: what changed in each update" }, items: [
    { k: "new", zh: "我的 → 发布日志：按类型、时间筛选，列表或时间线查看", en: "Me → Release notes: filter by type and time, view as a list or timeline" },
    { k: "new", zh: "有新版本时，今天页顶上会提示几次，点开就能看", en: "After an update, Today shows a short note a few times; tap it to see what's new" },
    { k: "better", zh: "右上角的版本号可以点，直接打开发布日志", en: "Tap the version number at the top right to open the release notes" }
  ] },
  { v: "2026-11-03.2", title: { zh: "备份也包括家人的健康记录", en: "Backups now include family health records" }, items: [
    { k: "better", zh: "备份与恢复会带上就诊、化验、测量等健康记录", en: "Backup and restore now cover visits, lab results, readings and other health records" }
  ] },
  { v: "2026-11-03.1", title: { zh: "就诊记录能筛选，就诊和化验有详情页", en: "Filter visits, plus detail pages for visits and lab tests" }, items: [
    { k: "new", zh: "就诊按类型、地点、年份筛选，列表或时间线查看", en: "Filter visits by type, place or year; view as a list or timeline" },
    { k: "new", zh: "每次就诊、每项化验都有详情页，可让 AI 解读", en: "Each visit and lab test has its own page, with an AI read" },
    { k: "new", zh: "就诊的医药费一键记到爱家小助手", en: "Log a visit's medical bill in Home Helper in one tap" },
    { k: "fix", zh: "修好：概览里点血糖却显示体重图", en: "Fixed: tapping blood sugar on the overview showed the weight chart" }
  ] },
  { v: "2026-11-02.3", title: { zh: "化验按项目分组，一张化验单一次录完", en: "Lab results grouped by panel, a whole report entered at once" }, items: [
    { k: "new", zh: "按血脂、肝肾功能、血常规等分组，一张表填完", en: "Enter labs by panel (lipids, metabolic, blood count…) in one table" },
    { k: "new", zh: "一次读最多 6 张照片或截图，自动填好各项", en: "Read up to 6 photos or screenshots at once to fill in every result" },
    { k: "better", zh: "以化验单上印的参考范围为准", en: "The reference range printed on the report is used" },
    { k: "better", zh: "手机上用下拉菜单选家人和栏目，更省地方", en: "On phones, pick the person and section from dropdowns to save space" }
  ] },
  { v: "2026-11-02.2", title: { zh: "健康页加上锻炼、饮食和每周计划", en: "Workouts, eating plans and a weekly plan in Health" }, items: [
    { k: "new", zh: "大人、孩子的锻炼模板，一点就记下今天做过", en: "Workout templates for adults and kids; log today's workout in one tap" },
    { k: "new", zh: "饮食模板，每顿饭一点就记下做到没有", en: "Eating plan templates; mark each meal with one tap" },
    { k: "new", zh: "根据化验、血压等给出建议，也可以让 AI 分析", en: "Suggestions based on labs, blood pressure and more, plus optional AI analysis" },
    { k: "new", zh: "饮食需要的食材一键加到爱家小助手的购物清单", en: "Add a meal plan's groceries to Home Helper's shopping list in one tap" }
  ] },
  { v: "2026-11-02.1", title: { zh: "新增「健康」页：记家人的就诊和化验", en: "New Health tab: your family's doctor visits and lab results" }, items: [
    { k: "new", zh: "给自己和家人记就诊、化验、在家测量（体重、血压等）", en: "Log visits, lab results and home readings (weight, blood pressure…) for you and your family" },
    { k: "new", zh: "走势图带参考范围，偏高偏低一眼看到", en: "Trend charts with reference ranges show what's high or low at a glance" },
    { k: "new", zh: "拍下就诊小结或化验单，让 AI 帮你填表", en: "Snap a visit summary or lab report and let AI fill in the form" },
    { k: "new", zh: "复诊日期会出现在日历订阅里，按时提醒", en: "Follow-up visits show up in your calendar subscription with reminders" }
  ] },
  { v: "2026-10-31.2", title: { zh: "灵修笔记很多时也打开得快", en: "Notes open quickly even when you have lots of them" }, items: [
    { k: "better", zh: "笔记先显示一批，往下再接着加载，打开更快", en: "Notes show one batch first and load more as you go, so they open faster" },
    { k: "better", zh: "搜索和按类型、标签、月份筛选都在全部笔记里找", en: "Search and filters (type, tag, month) look through all your notes" }
  ] },
  { v: "2026-10-31.1", title: { zh: "长列表分批显示，打开更快", en: "Long lists show in batches and open faster" }, items: [
    { k: "better", zh: "代祷、任务、笔记等长列表分批显示，底部「继续加载」", en: "Long lists (prayers, tasks, notes) show in batches, with Load more at the bottom" },
    { k: "new", zh: "设置 → 显示 里可选每次显示几条", en: "Choose how many items to show at a time in Settings → Appearance" },
    { k: "fix", zh: "记录很多时也不会漏掉，备份也完整", en: "Nothing gets left out when you have lots of records, backups included" },
    { k: "better", zh: "打开应用和切回来都更快", en: "Faster to open and to switch back to" }
  ] },
  { v: "2026-10-28.1", title: { zh: "加入家庭更安全：邀请码有期限，新成员要批准", en: "Safer family invites: codes expire and new members need approval" }, items: [
    { k: "new", zh: "邀请码 7 天有效，可以重新生成或关掉", en: "Invite codes last 7 days; regenerate or turn them off anytime" },
    { k: "new", zh: "新成员要家主批准，家主在设置和今天页批准或拒绝", en: "New members wait for the family owner to approve or decline in Settings or on Today" },
    { k: "better", zh: "子页顶上有「‹ 返回」，回到上一页", en: "Sub-pages have a ‹ Back button to the previous page" }
  ] },
  { v: "2026-10-27.2", title: { zh: "深色主题下日期选择器颜色正常了", en: "Date pickers look right in dark mode" }, items: [
    { k: "fix", zh: "深色主题里日期、时间选择器的图标和弹出框看得清", en: "Date and time pickers are easy to read in dark mode" }
  ] },
  { v: "2026-10-27.1", title: { zh: "设置里能看到存储用了多少", en: "See how much storage you've used in Settings" }, items: [
    { k: "new", zh: "设置里显示数据和文件各用了多少，快满时变黄变红", en: "Settings shows how much data and file space is used, turning yellow then red as it fills" }
  ] },
  { v: "2026-10-26.1", title: { zh: "浏览器标签上有了小图标", en: "A small icon in the browser tab" }, items: [
    { k: "better", zh: "浏览器标签页上显示应用的小图标", en: "The app now shows its icon in the browser tab" }
  ] },
  { v: "2026-10-25.29", title: { zh: "电脑上今天页两栏排得更顺手", en: "A handier two-column Today page on computers" }, items: [
    { k: "better", zh: "电脑上左边是今日习惯和家人，右边是读经、任务、笔记", en: "On computers, habits and family sit on the left; reading, tasks and notes on the right" }
  ] },
  { v: "2026-10-25.28", title: { zh: "备份记录不会再忽有忽无", en: "Backup history no longer comes and goes" }, items: [
    { k: "fix", zh: "Google 登录过期时，备份列表不再变空", en: "The backup list no longer goes blank when your Google sign-in expires" },
    { k: "better", zh: "过期时会提示，点一下重新登录并刷新", en: "You'll see a notice; one tap signs you in again and refreshes" }
  ] },
  { v: "2026-10-25.27", title: { zh: "「小Y问」改名「咩咩咩」，换上小羊图标", en: "Ask Y is now Baa Baa, with a little lamb icon" }, items: [
    { k: "better", zh: "AI 问询改名「咩咩咩」，助手叫「咩咩」", en: "The AI page is now called Baa Baa" },
    { k: "better", zh: "四个应用统一用可爱的小羊图标", en: "All four apps share the same cute lamb icon" }
  ] },
  { v: "2026-10-25.26", title: { zh: "备份记录更清爽", en: "A tidier backup history" }, items: [
    { k: "better", zh: "默认只显示最近 3 条，更早的可以展开", en: "Shows the latest 3 backups; expand to see older ones" },
    { k: "better", zh: "来源默认选 Google Drive", en: "Google Drive is picked as the source by default" }
  ] },
  { v: "2026-10-25.25", title: { zh: "新增「小Y问」：让 AI 帮你回顾", en: "New Ask Y: let AI help you look back" }, items: [
    { k: "new", zh: "我的 → 小Y问：灵修、身体、专注、祷告等七个话题", en: "Me → Ask Y: seven topics like devotions, health, focus and prayer" },
    { k: "new", zh: "没设置 AI 时，一键复制问题去常用的 AI 网站问", en: "Without an AI key, copy the question to your favorite AI site in one tap" },
    { k: "better", zh: "只发统计数字，不发祷告内容、笔记和家人姓名", en: "Only numbers are sent, never prayers, notes or family names" }
  ] },
  { v: "2026-10-25.24", title: { zh: "选好的 Drive 文件夹能正常写入", en: "The Drive folder you pick now works reliably" }, items: [
    { k: "fix", zh: "在 Drive 里选的文件夹，备份时不会再写不进去", en: "Backups no longer fail to save into a Drive folder you picked" }
  ] },
  { v: "2026-10-25.23", title: { zh: "Drive 文件夹怎么选，写得更清楚", en: "Clearer help for choosing a Drive folder" }, items: [
    { k: "better", zh: "想用 Drive 里已有的文件夹，会提示你点「选一个文件夹」", en: "A hint points you to Choose a folder for an existing Drive folder" }
  ] },
  { v: "2026-10-25.22", title: { zh: "升级后云盘不用重新连接", en: "No need to reconnect cloud drives after the update" }, items: [
    { k: "fix", zh: "原来连好的云盘升级后照样能用", en: "Cloud drives you'd already connected keep working after the update" }
  ] },
  { v: "2026-10-25.21", title: { zh: "定时备份交给小月亮统一做", en: "Scheduled backups now run from Little Moon" }, items: [
    { k: "better", zh: "定时备份由小月亮统一做，这里手动备份和恢复", en: "Little Moon handles scheduled backups; back up and restore by hand here" },
    { k: "better", zh: "云盘连一次，四个应用都能用", en: "Connect a cloud drive once for all four apps" },
    { k: "better", zh: "恢复只补上缺的，不覆盖也不删除", en: "Restoring only adds what's missing; nothing is overwritten or deleted" },
    { k: "new", zh: "能直接用小月亮打包的备份文件恢复", en: "Restore straight from a Little Moon backup file" }
  ] },
  { v: "2026-10-25.20", title: { zh: "可以直接备份到 Google Drive 和 Dropbox", en: "Back up straight to Google Drive or Dropbox" }, items: [
    { k: "new", zh: "手机、电脑都能直接连 Google Drive 或 Dropbox", en: "Connect Google Drive or Dropbox on phone or computer" },
    { k: "new", zh: "已有的备份按来源查看，可下载、恢复、删除", en: "Browse existing backups by source to download, restore or delete" }
  ] },
  { v: "2026-10-25.19", title: { zh: "今天页重新设计，加了统计卡", en: "A redesigned Today page with summary cards" }, items: [
    { k: "new", zh: "习惯、任务、读经、祷告四张统计卡，全做完变绿", en: "Four cards for habits, tasks, reading and prayer turn green when done" },
    { k: "better", zh: "点统计卡直接跳到对应的地方", en: "Tap a card to jump to that section" },
    { k: "better", zh: "逾期和马上要做的事放在最上面", en: "Overdue and upcoming items show at the top" }
  ] },
  { v: "2026-10-25.18", title: { zh: "备份页更好用，可以备份到云盘文件夹", en: "An easier backup page, with cloud sync folders" }, items: [
    { k: "better", zh: "备份页重新排版，状态和主按钮一目了然", en: "The backup page shows status and main buttons at a glance" },
    { k: "new", zh: "可备份到 Google Drive、Dropbox 等云盘的同步文件夹", en: "Back up into the sync folder of Google Drive, Dropbox and others" }
  ] },
  { v: "2026-10-25.17", title: { zh: "新增「备份与恢复」", en: "New Backup & restore" }, items: [
    { k: "new", zh: "我的 → 备份与恢复：一键备份或下载一份", en: "Me → Backup & restore: back up or download a copy in one tap" },
    { k: "new", zh: "可以按周、按月定时备份", en: "Schedule backups weekly or monthly" },
    { k: "new", zh: "从备份文件恢复，先预览再确认", en: "Restore from a backup file, with a preview first" }
  ] },
  { v: "2026-10-24.16", title: { zh: "「习惯与用药」页重新排版", en: "A cleaner Habits & meds page" }, items: [
    { k: "better", zh: "顶上四个标签：全部、习惯、用药、归档，带数量", en: "Four tabs at the top (All, Habits, Meds, Archived) with counts" },
    { k: "better", zh: "每行一眼看到目标、提醒时间和家人是否可见", en: "Each row shows the goal, reminder time and whether family can see it" },
    { k: "better", zh: "用药显示还剩多少、约能吃几天", en: "Meds show how many are left and about how many days that lasts" }
  ] },
  { v: "2026-10-24.15", title: { zh: "页面统一排版，手机电脑都好用", en: "Consistent pages that work on phone and computer" }, items: [
    { k: "better", zh: "各页标题、卡片和按钮统一，电脑上今天页分两栏", en: "Headings, cards and buttons match across pages; Today uses two columns on computers" },
    { k: "better", zh: "筛选统一成一个下拉按钮加搜索框", en: "Filters are one dropdown button plus a search box everywhere" },
    { k: "better", zh: "灵修笔记移到祷告页里，代祷也能搜索", en: "Devotional notes moved into the Prayer tab, and prayer requests are searchable" }
  ] },
  { v: "2026-10-24.14", title: { zh: "灵修笔记按月翻看，还有「历史上的今天」", en: "Browse notes by month, plus On this day" }, items: [
    { k: "new", zh: "笔记按月翻页，可以直接选月份", en: "Page through notes by month or jump to any month" },
    { k: "new", zh: "历史上的今天：往年同一天写的笔记", en: "On this day: notes you wrote on the same date in past years" },
    { k: "better", zh: "导出时可以只导出这个月", en: "Export just this month's notes if you like" }
  ] },
  { v: "2026-10-24.13", title: { zh: "笔记可以加粗、加标题、列清单", en: "Notes support bold, headings and lists" }, items: [
    { k: "new", zh: "写笔记有工具栏：粗体、标题、列表、引用", en: "A toolbar for bold, headings, lists and quotes" },
    { k: "new", zh: "可以预览，也可以全屏写", en: "Preview your note or write in full screen" }
  ] },
  { v: "2026-10-24.12", title: { zh: "新增「灵修笔记」", en: "New devotional notes" }, items: [
    { k: "new", zh: "记读书心得、读经领受、遇到的问题和圣灵感动", en: "Write down reading reflections, insights from Scripture, questions and promptings" },
    { k: "new", zh: "拍照识字，筛选搜索，导出打印", en: "Snap a photo to capture text; filter, search, export and print" },
    { k: "new", zh: "可以分享给指定的家人", en: "Share notes with chosen family members" }
  ] },
  { v: "2026-10-24.11", title: { zh: "左滑删除不再打乱排版", en: "Swipe to delete no longer messes up layouts" }, items: [
    { k: "fix", zh: "能左滑删除的行，样子和排版保持原样", en: "Rows you can swipe to delete keep their normal look and layout" }
  ] },
  { v: "2026-10-24.10", title: { zh: "只有该删的行才能左滑", en: "Only deletable rows can be swiped" }, items: [
    { k: "fix", zh: "不该删的地方不会再被误滑出删除", en: "Swiping no longer shows Delete in places that shouldn't have it" }
  ] },
  { v: "2026-10-24.9", title: { zh: "「我的」页重新整理，习惯与用药合成一页", en: "A reorganized Me page; habits and meds on one page" }, items: [
    { k: "better", zh: "我的页分成「每天要做的」「提醒与设置」两组", en: "The Me page is grouped into Daily and Reminders & settings" },
    { k: "better", zh: "习惯和用药在一页里，可以筛选", en: "Habits and meds share one page with filters" },
    { k: "new", zh: "药快吃完时标红「该补货了」", en: "Meds running low are marked Time to restock" }
  ] },
  { v: "2026-10-24.8", title: { zh: "左滑后点删除按钮有反应了", en: "The Delete button after swiping works now" }, items: [
    { k: "fix", zh: "左滑露出红色按钮后，点它就能删除", en: "Tapping the red button after swiping now deletes the row" }
  ] },
  { v: "2026-10-24.6", title: { zh: "左滑删除不改变行的样子", en: "Swipe to delete keeps rows looking the same" }, items: [
    { k: "fix", zh: "加了左滑删除的行，样式照旧", en: "Rows with swipe to delete keep their original style" }
  ] },
  { v: "2026-10-24.5", title: { zh: "左滑就能删除", en: "Swipe left to delete" }, items: [
    { k: "new", zh: "放弃的任务、今天的读经记录可以左滑删除", en: "Swipe left to delete dropped tasks and today's reading entries" }
  ] },
  { v: "2026-10-24.4", title: { zh: "往下滚时顶上显示站名，点它回到顶部", en: "A slim top bar while scrolling; tap to jump back up" }, items: [
    { k: "new", zh: "页面往下滚后，顶上有一条窄条，点它回到顶部", en: "After you scroll down, a slim bar appears at the top; tap it to go back up" }
  ] },
  { v: "2026-10-24.3", title: { zh: "新增「任务」：今天、计划、清单", en: "New Tasks: today, plan and list" }, items: [
    { k: "new", zh: "任务页：今天、计划（日、周、月）、清单、已完成", en: "Tasks tab: Today, Plan (day, week, month), List and Done" },
    { k: "new", zh: "分类、优先级、重复、子步骤、提醒，一句话就能添加", en: "Categories, priority, repeats, sub-steps and reminders; add a task in one line" },
    { k: "new", zh: "逾期会提醒，拖太久会请你做个决定", en: "Overdue tasks get nudges, and long-delayed ones ask you to decide" },
    { k: "new", zh: "有日期的任务出现在日历订阅里", en: "Tasks with dates show up in your calendar subscription" }
  ] },
  { v: "2026-10-24.2", title: { zh: "手机上版本号不再挤", en: "Version number fits on phones" }, items: [
    { k: "fix", zh: "手机窄屏时版本号放在同步状态下面", en: "On narrow phones the version number sits below the sync status" }
  ] },
  { v: "2026-10-24.1", title: { zh: "顶栏显示版本号", en: "Version number in the header" }, items: [
    { k: "new", zh: "同步状态旁边显示版本号，更新了没有一看就知道", en: "The version number sits next to the sync status, so you can tell if you're up to date" }
  ] },
  { v: "2026-10-23.3", title: { zh: "忘了打卡？可以补记前几天", en: "Forgot to check in? Log earlier days" }, items: [
    { k: "new", zh: "今天页可以切到前几天，补记打卡、读经、服药", en: "Switch Today to an earlier day to log habits, reading and meds" },
    { k: "better", zh: "最多补 12 周内的，点「回到今天」就回来", en: "Go back up to 12 weeks; tap Back to today to return" }
  ] },
  { v: "2026-10-23.2", title: { zh: "新增专注计时，还会提醒你护眼", en: "New focus timer with eye-rest reminders" }, items: [
    { k: "new", zh: "番茄钟：专注 25 分钟、休息 5 分钟", en: "Pomodoro timer: 25 minutes of focus, 5 minutes of rest" },
    { k: "new", zh: "专注中每 20 分钟提醒看远处 20 秒", en: "Every 20 minutes of focus, a reminder to look far away for 20 seconds" },
    { k: "new", zh: "完成的专注自动记下，回顾页能看到", en: "Finished focus sessions are logged and show up in Review" }
  ] },
  { v: "2026-10-23.1", title: { zh: "换语言更方便", en: "Easier language switching" }, items: [
    { k: "better", zh: "顶栏地球按钮选语言，会记在你的账号里", en: "Pick a language from the globe button; it's saved to your account" }
  ] },
  { v: "2026-10-22.2", title: { zh: "日历提醒跟着你选的语言", en: "Calendar reminders follow your language" }, items: [
    { k: "better", zh: "日历订阅里的标题和说明用你选的语言", en: "Calendar event titles and notes use the language you picked" }
  ] },
  { v: "2026-10-22.1", title: { zh: "右上角一键切换姊妹应用", en: "Switch between sister apps from the top right" }, items: [
    { k: "better", zh: "右上角的九宫格按钮可切换到其他三个应用", en: "The grid button at the top right switches to the other three apps" }
  ] },
  { v: "2026-10-21.1", title: { zh: "牧羊人上线：记录身、心、灵", en: "Shepherd launches: track body, mind and spirit" }, items: [
    { k: "new", zh: "读经计划，可展开和合本或英文经文", en: "Bible reading plans with Chinese or English text you can expand" },
    { k: "new", zh: "祷告清单和打卡", en: "Prayer lists and check-ins" },
    { k: "new", zh: "锻炼、饮食、睡眠、用药等习惯，可开给家人看", en: "Habits for exercise, eating, sleep, meds and more, shareable with family" },
    { k: "new", zh: "回顾页看每周走势，日历订阅按时提醒", en: "Review weekly trends, and get reminders through a calendar subscription" }
  ] }
];
