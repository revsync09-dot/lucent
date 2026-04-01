create table if not exists public.trade_items (
  id bigint generated always as identity primary key,
  game_key text not null,
  item_name text not null,
  slug text not null,
  wiki_title text not null,
  wiki_url text not null,
  image_url text,
  category text,
  rarity text,
  item_type text,
  description text,
  source text not null default 'fandom',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trade_items_game_slug_key
  on public.trade_items (game_key, slug);

create index if not exists trade_items_game_key_idx
  on public.trade_items (game_key);

create index if not exists trade_items_category_idx
  on public.trade_items (category);

create index if not exists trade_items_updated_at_idx
  on public.trade_items (updated_at desc);
