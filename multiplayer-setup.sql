-- =====================================================================
-- 美味特工队 · 像素方块世界 —— 多人联机建表脚本
-- 用法：登录 Supabase → SQL Editor → New query → 粘贴本文件全部内容 → Run。
--      看到 "Success. No rows returned" 即完成。可重复运行（幂等）。
-- 说明：本游戏无登录账号，使用公开(anon) key + RLS 策略，开放"创建/加入房间、
--      共建方块"。适合几个小朋友凭房间码进入同一个世界一起搭建。
-- =====================================================================

-- 1) 多人世界（房间）表 ------------------------------------------------
create table if not exists public.mp_worlds (
  code        text primary key,                 -- 6 位房间码（大写字母+数字）
  name        text    not null default '特工共建世界',
  nickname    text    not null default '房主',    -- 创建者昵称
  skin        text    not null default 'burger', -- 创建者皮肤
  created_at  timestamptz not null default now(),
  touched_at  timestamptz not null default now() -- 最近活动（用于排序/清理）
);
create index if not exists idx_mp_worlds_touched on public.mp_worlds (touched_at desc);

-- 2) 方块编辑表（放/拆记录，每格一行，后写覆盖） ------------------------
--     bx/by/bz 为世界坐标整数；type 为方块 id（0 = 空气=被拆除）。
create table if not exists public.mp_edits (
  world_code  text    not null,
  bx          integer not null,
  by          integer not null,
  bz          integer not null,
  type        integer not null default 0,
  dir         smallint not null default 0,       -- 家具朝向 0..3（无朝向方块为 0）
  pid         text    not null default '',       -- 发送者玩家id（用于跳过自己回声）
  nickname    text    not null default '小探险家',
  created_at  timestamptz not null default now(),
  primary key (world_code, bx, by, bz)           -- 同一格只保留最新一次改动
);
create index if not exists idx_mp_edits_world on public.mp_edits (world_code);

-- 3) 启用行级安全（RLS） ------------------------------------------------
alter table public.mp_worlds enable row level security;
alter table public.mp_edits  enable row level security;

-- 房间：公开可读（加入时核对房间码）
drop policy if exists mp_worlds_select_public on public.mp_worlds;
create policy mp_worlds_select_public
  on public.mp_worlds for select
  to anon, authenticated
  using (true);

-- 房间：公开可创建（房间码长度 4~10、昵称长度 1~24，防乱写）
drop policy if exists mp_worlds_insert_public on public.mp_worlds;
create policy mp_worlds_insert_public
  on public.mp_worlds for insert
  to anon, authenticated
  with check (char_length(code) between 4 and 10 and char_length(nickname) <= 24);

-- 房间：公开可更新活动时间（用于 touched_at）
drop policy if exists mp_worlds_update_public on public.mp_worlds;
create policy mp_worlds_update_public
  on public.mp_worlds for update
  to anon, authenticated
  using (true) with check (true);

-- 方块：公开可读（进房时拉取本世界改动）
drop policy if exists mp_edits_select_public on public.mp_edits;
create policy mp_edits_select_public
  on public.mp_edits for select
  to anon, authenticated
  using (true);

-- 方块：公开可写（放/拆共建；房间码长度、坐标在合理范围）
drop policy if exists mp_edits_insert_public on public.mp_edits;
create policy mp_edits_insert_public
  on public.mp_edits for insert
  to anon, authenticated
  with check (
    char_length(world_code) between 4 and 10
    and by between -64 and 256
    and char_length(nickname) <= 24
  );

-- 方块：公开可更新（同一格 upsert 覆盖）
drop policy if exists mp_edits_update_public on public.mp_edits;
create policy mp_edits_update_public
  on public.mp_edits for update
  to anon, authenticated
  using (true) with check (true);

-- 4) 开启 Realtime 实时推送（放/拆方块、房间活动实时广播给房间内玩家） --
--     Supabase 的 postgres_changes 订阅要求表在 realtime publication 中。
--     用 DO 块保证可重复运行（已加入时 duplicate_object 自动忽略）。
do $$
begin
  begin
    alter publication supabase_realtime add table public.mp_worlds;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.mp_edits;
  exception when duplicate_object then null;
  end;
end$$;

-- 5) 在线心跳表（不依赖 WebSocket 的"看到彼此"保险通道） ------------------
--     每个房间每个玩家一行，进房写入、游戏中每 ~1.2s 刷新 last_seen；
--     last_seen 超过 15 秒视为离线。用于 Realtime presence 被网络拦截时，
--     仍能通过普通 HTTPS 请求看到同房间的小伙伴。
create table if not exists public.mp_presence (
  world_code  text not null,
  pid         text not null,
  nickname    text not null default '小探险家',
  skin        text not null default 'burger',
  x           real not null default 0,
  y           real not null default 0,
  z           real not null default 0,
  yaw         real not null default 0,
  pose        text not null default 'stand',
  last_seen   timestamptz not null default now(),
  primary key (world_code, pid)
);
create index if not exists idx_mp_presence_seen on public.mp_presence (world_code, last_seen desc);

alter table public.mp_presence enable row level security;

drop policy if exists mp_presence_select_public on public.mp_presence;
create policy mp_presence_select_public
  on public.mp_presence for select
  to anon, authenticated
  using (true);

drop policy if exists mp_presence_write_public on public.mp_presence;
create policy mp_presence_write_public
  on public.mp_presence for all
  to anon, authenticated
  using (true) with check (char_length(world_code) between 4 and 10);

-- 心跳 RPC：刷新自己的在线状态 + 清理本房间过期记录 + 返回当前在线名单。
-- 用一个请求完成"上报 + 拉名单"，SECURITY DEFINER 以便 DELETE 过期行。
create or replace function public.mp_heartbeat(
  p_code text, p_pid text, p_nickname text default '小探险家',
  p_skin text default 'burger', p_x real default 0, p_y real default 0,
  p_z real default 0, p_yaw real default 0, p_pose text default 'stand'
)
returns table (pid text, nickname text, skin text, x real, y real, z real, yaw real, pose text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 清理本房间 15 秒没心跳的离线玩家
  delete from public.mp_presence
   where world_code = p_code and last_seen < now() - interval '15 seconds';

  -- 刷新/插入自己
  insert into public.mp_presence (world_code, pid, nickname, skin, x, y, z, yaw, pose, last_seen)
  values (p_code, p_pid,
          left(coalesce(p_nickname, '小探险家'), 24),
          coalesce(p_skin, 'burger'),
          coalesce(p_x, 0), coalesce(p_y, 0), coalesce(p_z, 0),
          coalesce(p_yaw, 0), coalesce(p_pose, 'stand'), now())
  on conflict (world_code, pid)
  do update set nickname = excluded.nickname, skin = excluded.skin,
                x = excluded.x, y = excluded.y, z = excluded.z,
                yaw = excluded.yaw, pose = excluded.pose, last_seen = now();

  return query
    select h.pid, h.nickname, h.skin, h.x, h.y, h.z, h.yaw, h.pose
      from public.mp_presence h
     where h.world_code = p_code and h.pid <> p_pid
     order by h.last_seen desc;
end;
$$;

-- 离开房间时调用：主动删除自己的在线记录（立刻下线）。
create or replace function public.mp_leave_room(p_code text, p_pid text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.mp_presence where world_code = p_code and pid = p_pid;
$$;

-- 完成！现在打开游戏，开始界面会出现“多人共建”面板。
