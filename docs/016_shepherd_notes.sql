-- 牧羊人 · 增量升级 016：灵修笔记（读书心得、读经领受、遇到的问题、圣灵感动）
-- 适用：已执行 013。可重复执行；不删任何数据；整体在一个事务里。
-- 这个文件放在 shepherd/docs 里方便复制；baby-log 本机的 supabase/migrations 目录是 .sql 的老家，也可以拷一份过去（那里不进 git）。
--
-- 可见性：默认只有本人。本人可以把某一条分享给家庭里指定的家人（shared_with），被指定的人只读。
--   读：本人；或者 本人在 shared_with 里 且 这行的 family_id 是本人所在的家庭。
--   写：只有本人。user_id 一旦写入不可改；family_id 由守卫触发器按 shared_with 和本人所在家庭自动填；
--   shared_with 里不是同一家庭成员的 id 会被守卫丢掉。
-- 拍照识字的原图不进数据库、不进 Storage：只存用户选定的文字（quote）。
begin;

create table if not exists public.wb_notes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,                                   -- 前端生成
  kind        text not null default 'reading' check (kind in ('reading', 'scripture', 'question', 'spirit')),
  day         date not null,                                   -- 记在哪一天（本地日期）
  ref         text not null default '',                        -- 经文出处，如 罗马书 8:26
  source      text not null default '',                        -- 书名 / 作者 / 页码
  quote       text not null default '',                        -- 摘录的原文（拍照识字后选定的段落）
  reflection  text not null default '',                        -- 自己的心得、感想、问题、领受
  tags        text[] not null default '{}',
  ai_used     boolean not null default false,                  -- 摘录是否经过 AI 识字（提醒自己核对）
  shared_with uuid[] not null default '{}',                    -- 分享给哪几位家人（只读）；空 = 仅自己
  family_id   uuid references public.families(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists wb_notes_day_idx on public.wb_notes (user_id, day desc);
create index if not exists wb_notes_shared_idx on public.wb_notes using gin (shared_with);

-- 守卫：user_id 不可改；shared_with 只留同一家庭的成员（不含自己）；有人可看才记 family_id
create or replace function public.wb_notes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare fam uuid;
begin
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  if new.user_id <> auth.uid() then raise exception 'wb: not yours'; end if;
  select family_id into fam from public.family_members where user_id = new.user_id limit 1;
  if fam is null then
    new.shared_with := '{}'; new.family_id := null;
  else
    new.shared_with := coalesce((
      select array_agg(distinct u) from unnest(new.shared_with) u
      where u <> new.user_id and exists (select 1 from public.family_members fm where fm.family_id = fam and fm.user_id = u)
    ), '{}');
    new.family_id := case when cardinality(new.shared_with) > 0 then fam else null end;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists wb_notes_guard on public.wb_notes;
create trigger wb_notes_guard before insert or update on public.wb_notes for each row execute function public.wb_notes_guard();

alter table public.wb_notes enable row level security;
drop policy if exists wb_notes_select on public.wb_notes;
create policy wb_notes_select on public.wb_notes for select to authenticated
  using (user_id = auth.uid() or (auth.uid() = any(shared_with) and family_id is not null and public.is_member(family_id)));
drop policy if exists wb_notes_insert on public.wb_notes;
create policy wb_notes_insert on public.wb_notes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wb_notes_update on public.wb_notes;
create policy wb_notes_update on public.wb_notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wb_notes_delete on public.wb_notes;
create policy wb_notes_delete on public.wb_notes for delete to authenticated using (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.wb_notes;
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.wb_notes to authenticated;

commit;

-- 验证（SQL Editor 里是 service role，看不出 RLS；请在网页里用两个账号试）：
-- select policyname, cmd from pg_policies where tablename = 'wb_notes' order by cmd;
-- select tgname from pg_trigger where tgname = 'wb_notes_guard';
