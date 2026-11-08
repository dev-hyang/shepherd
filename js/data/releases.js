/* ============ 发布日志的数据（我的 → 发布日志；新版本时今天页顶上提示几次） ============
   每次推送：升 APP_VERSION（js/core/config.js）并在最前面加一条，v 必须和 APP_VERSION 一样，否则今天页不提示。
   写给家人看的话：标题一句话，要点 1–4 条、每条一句，不写技术词。k：new 新功能 / better 改进 / fix 修复。
   页面和样式在 js/releases-ui.js（四个姊妹应用共用，别单独改）。 */
export const RELEASES = [
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
  ] }
];
