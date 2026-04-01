import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { env, request } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Database not configured' }), { status: 500, headers });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    if (request.method === 'POST') {
      const body = await request.json();
      const { action, sessionId, username, content, after } = body || {};

      if (action === 'send') {
        if (!sessionId || !content?.trim()) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing sessionId or content' }), { status: 400, headers });
        }
        const guildId = env.DISCORD_GUILD_ID || '0';
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
        return new Response(JSON.stringify({ ok: true, message: msg, conversationId: conv.id }), { status: 200, headers });
      }

      if (action === 'history') {
        if (!sessionId) return new Response(JSON.stringify({ ok: false, error: 'Missing sessionId' }), { status: 400, headers });
        const { data: conv } = await supabase.from('modmail_conversations').select('*').eq('session_id', sessionId).maybeSingle();
        if (!conv) return new Response(JSON.stringify({ ok: true, messages: [], status: null }), { status: 200, headers });

        let query = supabase.from('modmail_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
        if (after) query = query.gt('created_at', after);
        const { data: messages } = await query;

        return new Response(JSON.stringify({ ok: true, messages: messages || [], status: conv.status }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ ok: false, error: 'Invalid action' }), { status: 400, headers });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers });
  } catch (err) {
    console.error('[modmail-api]', err);
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Server error' }), { status: 500, headers });
  }
}
