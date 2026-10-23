-- 牧羊人 · 增量升级 015：任务（含事件）
-- 适用：已执行 013（以及 014）。可重复执行；不删任何数据；整体在一个事务里。
-- 这个文件放在 shepherd/docs 里方便复制；baby-log 本机的 supabase/migrations 目录是 .sql 的老家，也可以拷一份过去（那里不进 git）。
-- 做法：任务一张表 wb_tasks，守卫和行级权限沿用 013 的 wb_guard()；完成记录不另建表，直接写 wb_logs（kind = 'task'）。
-- 设计见 docs/design-tasks.md。
begin;

create table if not exists public.wb_tasks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,                                   -- 前端生成
  title       text not null default '',
  note        text not null default '',
  kind        text not null default 'task' check (kind in ('task', 'event')),
  cat         text not null default 'inbox',                   -- 大类 id（内置或 wb_profile.settings.taskCats 自定义）
  sub         text not null default '',                        -- 小类 id
  period      text not null default 'day' check (period in ('day', 'week', 'month', 'quarter', 'year')),
  due         date,                                            -- 到期日；period ≠ day 时 = 该周期最后一天；收件箱可空
  start_time  text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  dur         int  check (dur is null or dur between 1 and 1440),   -- 预估 / 时长（分钟）
  recur       jsonb,                                           -- {freq:'day'|'week'|'month'|'year', every, days:[0..6], mday, until, after}
  prio        int  not null default 0 check (prio between 0 and 3),
  remind      jsonb not null default '[]'::jsonb,              -- 提前几分钟的数组，如 [0, 30]
  nag         boolean not null default false,                  -- 要催：到点后再响两次
  subtasks    jsonb not null default '[]'::jsonb,              -- [{t, done}]
  status      text not null default 'open' check (status in ('open', 'done', 'dropped')),
  done_at     timestamptz,                                     -- 完成或放弃的时间
  slips       int  not null default 0,                         -- 顺延次数
  practice_id text,                                            -- 关联习惯（可空，第三期用）
  with_ids    uuid[] not null default '{}',                    -- 一起做的家人（第三期用）
  share       text not null default 'private' check (share in ('private', 'family')),
  share_mode  text not null default 'detail' check (share_mode in ('detail', 'busy')),
  family_id   uuid references public.families(id) on delete set null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists wb_tasks_due_idx    on public.wb_tasks (user_id, status, due);
create index if not exists wb_tasks_family_idx on public.wb_tasks (family_id, due) where share = 'family';

drop trigger if exists wb_tasks_guard on public.wb_tasks;
create trigger wb_tasks_guard before insert or update on public.wb_tasks for each row execute function public.wb_guard();

alter table public.wb_tasks enable row level security;
drop policy if exists wb_tasks_select on public.wb_tasks;
create policy wb_tasks_select on public.wb_tasks for select to authenticated
  using (user_id = auth.uid() or (share = 'family' and family_id is not null and public.is_member(family_id)) or auth.uid() = any (with_ids));
drop policy if exists wb_tasks_insert on public.wb_tasks;
create policy wb_tasks_insert on public.wb_tasks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wb_tasks_update on public.wb_tasks;
create policy wb_tasks_update on public.wb_tasks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wb_tasks_delete on public.wb_tasks;
create policy wb_tasks_delete on public.wb_tasks for delete to authenticated using (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.wb_tasks;
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.wb_tasks to authenticated;

commit;

-- 验证：
-- select tablename, policyname, cmd from pg_policies where tablename = 'wb_tasks' order by cmd;
-- select tgname from pg_trigger where tgrelid = 'public.wb_tasks'::regclass and not tgisinternal;
