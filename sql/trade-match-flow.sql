alter table if exists public.trade_posts
  add column if not exists message_id text,
  add column if not exists thread_id text,
  add column if not exists matched_by text,
  add column if not exists matched_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create table if not exists public.trade_matches (
  id uuid primary key default gen_random_uuid(),
  trade_post_id uuid not null references public.trade_posts(id) on delete cascade,
  guild_id text not null,
  owner_user_id text not null,
  accepter_user_id text not null,
  game_key text,
  status text not null default 'accepted',
  owner_items jsonb not null default '[]'::jsonb,
  accepter_items jsonb not null default '[]'::jsonb,
  discord_thread_id text,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trade_matches_post_status
  on public.trade_matches (trade_post_id, status);

create index if not exists idx_trade_matches_owner_status
  on public.trade_matches (owner_user_id, status);

create index if not exists idx_trade_matches_accepter_status
  on public.trade_matches (accepter_user_id, status);

create table if not exists public.trade_confirmations (
  id uuid primary key default gen_random_uuid(),
  trade_match_id uuid not null references public.trade_matches(id) on delete cascade,
  user_id text not null,
  status text not null,
  note text,
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (trade_match_id, user_id)
);

create index if not exists idx_trade_confirmations_match
  on public.trade_confirmations (trade_match_id);
