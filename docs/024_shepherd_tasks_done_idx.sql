-- 牧羊人 · 增量升级 024：给“近 12 周关掉的任务”加索引
-- 适用：已执行 015。可重复执行；不删任何数据；不改表结构，只加一个索引；整体在一个事务里。
-- 这个文件放在 shepherd/docs 里方便复制；baby-log 本机的 supabase/migrations 目录是 .sql 的老家，也可以拷一份过去（那里不进 git）。
-- 编号接着 baby-log 的 023（entries_type_ts_idx；同一个 Supabase 项目，迁移共用一套编号）。
--
-- 为什么：任务页一打开（js/tk.js loadTasks）就读
--   where user_id = 我 and status <> 'open' and done_at >= 84 天前  order by done_at desc, id
-- 015 只有 (user_id, status, due) 的索引，status <> 'open' 用不上它，done_at 只能在这个人的全部任务里逐行筛。
-- 部分索引只收已完成 / 放弃的行（status <> 'open'），和查询条件完全一致，顺带按 done_at 倒序 + id 排好，翻页（.range）不用再排序。
begin;

create index if not exists wb_tasks_closed_idx on public.wb_tasks (user_id, done_at desc, id) where status <> 'open';

commit;

-- 验证：
-- select indexname, indexdef from pg_indexes where tablename = 'wb_tasks' order by indexname;
-- explain select * from public.wb_tasks where user_id = auth.uid() and status <> 'open' and done_at >= now() - interval '84 days' order by done_at desc, id;
