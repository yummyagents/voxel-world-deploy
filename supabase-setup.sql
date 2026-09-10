-- =====================================================================
-- 美味特工队 · 像素方块训练基地 —— 社区功能建表脚本
-- 用法：登录 Supabase → 左侧 SQL Editor → New query → 把本文件全部内容
--      粘进去 → 点右下角 Run。看到 "Success. No rows returned" 即完成。
-- 说明：本脚本可重复运行（幂等），已建过的表/函数会自动跳过或更新。
-- 安全：anon（公开）只能做下面三件事，看不到/改不了底层计数表：
--      · 访客计数：调用 increment_visit()  +1
--      · 点赞：    调用 increment_like()   +1（同设备前端去重）
--      · 留言：    只能插入新留言、只能读取“已审核通过”的留言
--      审核/删除留言由妈妈用 secret(service_role) 密钥在 admin.html 完成。
-- =====================================================================

-- 1) 留言表 ------------------------------------------------------------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  nickname    text    not null default '神秘小探险家',
  content     text    not null,
  approved    boolean not null default false,   -- 妈妈审核后才在前台展示
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_approved_created
  on public.messages (approved, created_at desc);

-- 2) 计数表（访客 visits / 点赞 likes） --------------------------------
create table if not exists public.counters (
  id     text primary key,
  value  bigint not null default 0
);
insert into public.counters (id, value) values ('visits', 0), ('likes', 0)
  on conflict (id) do nothing;

-- 3) 点赞记录表（留档用，可选） ----------------------------------------
create table if not exists public.likes (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 4) RPC 函数（SECURITY DEFINER：用函数内部权限更新，公开用户无需写表权限）
-- =====================================================================

-- 访客 +1，返回最新访客数
create or replace function public.increment_visit()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_count bigint;
begin
  insert into public.counters (id, value) values ('visits', 1)
    on conflict (id) do update set value = public.counters.value + 1;
  select value into new_count from public.counters where id = 'visits';
  return new_count;
end;
$$;

-- 点赞 +1，返回最新点赞数
create or replace function public.increment_like()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_count bigint;
begin
  insert into public.likes default values;
  insert into public.counters (id, value) values ('likes', 1)
    on conflict (id) do update set value = public.counters.value + 1;
  select value into new_count from public.counters where id = 'likes';
  return new_count;
end;
$$;

-- 安全读取访客数与点赞数（前台展示用；不开放 counters 表直接读）
create or replace function public.get_counts()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'visits', (select value from public.counters where id = 'visits'),
    'likes',  (select value from public.counters where id = 'likes')
  );
$$;

-- =====================================================================
-- 5) 行级安全策略（RLS）
-- =====================================================================
alter table public.messages enable row level security;
alter table public.counters enable row level security;
alter table public.likes    enable row level security;

-- 留言：公开可“插入”（提交留言，内容 1~200 字）
drop policy if exists messages_insert_public on public.messages;
create policy messages_insert_public
  on public.messages for insert
  to anon, authenticated
  with check (char_length(content) between 1 and 200);

-- 留言：公开只能“读取已审核通过”的留言（待审核的公开看不到）
drop policy if exists messages_select_approved on public.messages;
create policy messages_select_approved
  on public.messages for select
  to anon, authenticated
  using (approved = true);

-- 计数表 / 点赞记录表：公开不可直接读写（计数一律走上面的 RPC 函数）
drop policy if exists counters_no_public on public.counters;
create policy counters_no_public
  on public.counters for all
  to anon
  using (false) with check (false);

drop policy if exists likes_no_public on public.likes;
create policy likes_no_public
  on public.likes for all
  to anon
  using (false) with check (false);

-- 允许公开调用三个函数
grant execute on function public.increment_visit() to anon, authenticated;
grant execute on function public.increment_like()  to anon, authenticated;
grant execute on function public.get_counts()      to anon, authenticated;
