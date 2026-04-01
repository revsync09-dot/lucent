-- ==========================================
-- HYPERNARIOS COMPLETE DATABASE SETUP
-- ==========================================

-- 1. ANALYTICS: MESSAGE TRACKING
CREATE TABLE IF NOT EXISTS server_messages (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  message_id      TEXT NOT NULL UNIQUE,
  channel_id      TEXT NOT NULL,
  channel_name    TEXT NOT NULL DEFAULT '',
  user_id         TEXT NOT NULL,
  username        TEXT NOT NULL DEFAULT '',
  deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_server_messages_guild_sent ON server_messages (guild_id, sent_at DESC);

-- 2. ANALYTICS: VC SESSIONS
CREATE TABLE IF NOT EXISTS vc_sessions (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  username        TEXT NOT NULL DEFAULT '',
  channel_id      TEXT NOT NULL,
  channel_name    TEXT NOT NULL DEFAULT '',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at         TIMESTAMPTZ,
  duration_minutes NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vc_sessions_guild_joined ON vc_sessions (guild_id, joined_at DESC);
DROP INDEX IF EXISTS vc_sessions_unique_session;
CREATE UNIQUE INDEX vc_sessions_unique_session ON vc_sessions (user_id, channel_id, guild_id) WHERE (left_at IS NULL);

-- 3. ANALYTICS: GUILD GROWTH
CREATE TABLE IF NOT EXISTS guild_growth (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('join', 'leave')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guild_growth_guild_created ON guild_growth (guild_id, created_at DESC);

-- 4. CARRY SYSTEM: TICKETS
CREATE TABLE IF NOT EXISTS carry_tickets (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  channel_id      TEXT NOT NULL UNIQUE,
  user_id         TEXT NOT NULL,
  game_key        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  claimed_by      TEXT,
  closed_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- 5. VOUCHING SYSTEM
CREATE TABLE IF NOT EXISTS vouches (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  helper_user_id  TEXT NOT NULL,
  game_key        TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  message         TEXT DEFAULT '',
  message_id      TEXT,
  channel_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. USER STATS (PRE-TICKET CHECK)
CREATE TABLE IF NOT EXISTS user_message_stats (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  message_count   INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, user_id)
);

-- 7. BLACKLIST
CREATE TABLE IF NOT EXISTS ticket_blacklist (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  reason          TEXT DEFAULT '',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, user_id)
);

-- 8. BOT SETTINGS
CREATE TABLE IF NOT EXISTS bot_settings (
  guild_id        TEXT PRIMARY KEY,
  min_messages    INTEGER DEFAULT 30,
  active_season   TEXT DEFAULT 'Season 1',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. COMMAND LOGS
CREATE TABLE IF NOT EXISTS command_logs (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  command_name    TEXT NOT NULL,
  details         TEXT,
  target_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. HELPER APPLICATIONS
CREATE TABLE IF NOT EXISTS helper_applications (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  username        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT,
  review_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ
);

-- 11. MODMAIL SYSTEM
CREATE TABLE IF NOT EXISTS modmail_conversations (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  session_id      TEXT UNIQUE NOT NULL,
  username        TEXT NOT NULL,
  discord_user_id TEXT,
  thread_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  staff_typing_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS modmail_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES modmail_conversations(id) ON DELETE CASCADE,
  sender          TEXT NOT NULL,
  sender_name     TEXT NOT NULL,
  content         TEXT NOT NULL,
  forwarded       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. HELPER PRESENCE & PERFORMANCE
CREATE TABLE IF NOT EXISTS helper_presence (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  game_key        TEXT NOT NULL,
  is_online       BOOLEAN DEFAULT FALSE,
  last_clock_in   TIMESTAMPTZ,
  UNIQUE(guild_id, user_id, game_key)
);

CREATE TABLE IF NOT EXISTS helper_performance (
  user_id         TEXT PRIMARY KEY,
  current_streak  INTEGER DEFAULT 0,
  max_streak      INTEGER DEFAULT 0,
  total_xp        INTEGER DEFAULT 0,
  level           INTEGER DEFAULT 1,
  last_five_star_at TIMESTAMPTZ
);

-- 13. PENDING MESSAGES (LEGACY/SYNC)
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  message_id      TEXT UNIQUE NOT NULL,
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RPC / FUNCTIONS
CREATE OR REPLACE FUNCTION increment_user_message_count(p_guild_id TEXT, p_user_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO user_message_stats (guild_id, user_id, message_count, updated_at)
  VALUES (p_guild_id, p_user_id, 1, NOW())
  ON CONFLICT (guild_id, user_id)
  DO UPDATE SET message_count = user_message_stats.message_count + 1, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_user_message_count(p_guild_id TEXT, p_user_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE user_message_stats
  SET message_count = GREATEST(0, message_count - 1), updated_at = NOW()
  WHERE guild_id = p_guild_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
