
alter table ticket_blacklist add column if not exists expires_at timestamptz;

create table if not exists messages (
  message_id text primary key,
  guild_id text not null,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_created_at on messages (created_at);

create or replace function decrement_user_message_count(p_guild_id text, p_user_id text)
returns void
language plpgsql
as $$
begin
  update user_message_stats
  set message_count = greatest(0, message_count - 1),
      updated_at = now()
  where guild_id = p_guild_id and user_id = p_user_id;
end;
$$;

create or replace function cleanup_old_messages()
returns void
language plpgsql
as $$
begin
  delete from messages where created_at < now() - interval '48 hours';
end;
$$;