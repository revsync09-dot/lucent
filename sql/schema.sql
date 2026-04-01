create extension if not exists pgcrypto;

create table if not exists carry_tickets (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null unique,
  user_id text not null,
  game_key text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text,
  claimed_by text,
  close_reason text,
  claimed_at timestamptz
);

alter table carry_tickets add column if not exists claimed_by text;

create table if not exists vouches (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  helper_user_id text not null,
  game_key text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  message text not null,
  message_id text,
  channel_id text,
  created_at timestamptz not null default now()
);

create table if not exists user_message_stats (
  guild_id text not null,
  user_id text not null,
  message_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create or replace function increment_user_message_count(p_guild_id text, p_user_id text)
returns void
language plpgsql
as $$
declare
  last_upd timestamptz;
begin

  select updated_at into last_upd
  from user_message_stats
  where guild_id = p_guild_id and user_id = p_user_id;

  if last_upd is not null and (now() - last_upd) > interval '24 hours' then
    update user_message_stats
    set message_count = 1,
        updated_at = now()
    where guild_id = p_guild_id and user_id = p_user_id;
  else

    insert into user_message_stats (guild_id, user_id, message_count, updated_at)
    values (p_guild_id, p_user_id, 1, now())
    on conflict (guild_id, user_id)
    do update
      set message_count = user_message_stats.message_count + 1,
          updated_at = now();
  end if;
end;
$$;

create table if not exists ticket_blacklist (
  guild_id text not null,
  user_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists bot_settings (
  guild_id text primary key,
  min_messages integer not null default 30,
  active_season text default 'Season 1',
  updated_at timestamptz not null default now()
);

create table if not exists command_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  command_name text not null,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_command_logs_guild_created on command_logs (guild_id, created_at desc);
create index if not exists idx_ticket_blacklist_guild on ticket_blacklist (guild_id);
create index if not exists idx_bot_settings_guild on bot_settings (guild_id);

create table if not exists trade_posts (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  game_key text,
  trading_item text not null,
  looking_for text not null,
  settings jsonb default '{}'::jsonb,
  status text default 'open',
  created_at timestamptz not null default now()
);

create index if not exists idx_trade_posts_user_created on trade_posts (user_id, created_at desc);

create table if not exists trade_sessions (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  game_key text not null,
  token text not null unique,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  initial_data jsonb
);

create index if not exists idx_trade_sessions_token on trade_sessions (token);
create index if not exists idx_trade_sessions_user_status on trade_sessions (user_id, status);
