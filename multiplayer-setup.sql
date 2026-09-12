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

-- 完成！现在打开游戏，开始界面会出现“多人共建”面板。
