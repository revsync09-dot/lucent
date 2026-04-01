const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Database not configured' });

  try {
    if (req.method === 'POST') {
      const { action, sessionId, username, content, after } = req.body || {};

      if (action === 'send') {
        if (!sessionId || !content?.trim()) {
          return res.status(400).json({ ok: false, error: 'Missing sessionId or content' });
        }
        const guildId = process.env.DISCORD_GUILD_ID || '0';
        const { data: conv, error: convErr } = await supabase
          .from('modmail_conversations')
          .upsert(
            { guild_id: guildId, session_id: sessionId, username: username || 'Website User', status: 'open', updated_at: new Date().toISOString() },
            { onConflict: 'session_id' }
          )
          .select('*')
          .single();
        if (convErr) throw convErr;

        const { data: msg, error: msgErr } = await supabase
          .from('modmail_messages')
          .insert({ conversation_id: conv.id, sender: 'user', sender_name: username || 'Website User', content: content.trim().slice(0, 2000) })
          .select('*')
          .single();
        if (msgErr) throw msgErr;

        await supabase.from('modmail_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conv.id);
        return res.status(200).json({ ok: true, message: msg, conversationId: conv.id });
      }

      if (action === 'history') {
        if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing sessionId' });
        const { data: conv } = await supabase.from('modmail_conversations').select('*').eq('session_id', sessionId).maybeSingle();
        if (!conv) return res.status(200).json({ ok: true, messages: [], status: null });

        let query = supabase.from('modmail_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
        if (after) query = query.gt('created_at', after);
        const { data: messages } = await query;

        return res.status(200).json({ ok: true, messages: messages || [], status: conv.status });
      }

      return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[modmail-api]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
};