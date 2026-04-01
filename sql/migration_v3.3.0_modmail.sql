CREATE TABLE IF NOT EXISTS modmail_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT 'Anonymous',
  discord_user_id TEXT,
  thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modmail_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES modmail_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'User',
  content TEXT NOT NULL,
  forwarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modmail_conv_session ON modmail_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_modmail_conv_thread ON modmail_conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_modmail_msg_conv ON modmail_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_modmail_msg_unforwarded ON modmail_messages(forwarded) WHERE forwarded = FALSE;

ALTER TABLE modmail_messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN NOT NULL DEFAULT FALSE;