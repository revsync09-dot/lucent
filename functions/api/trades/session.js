import { createClient } from '@supabase/supabase-js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return json({}, 200);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const token = String(new URL(request.url).searchParams.get('session') || new URL(request.url).searchParams.get('token') || '').trim();
  if (!token) return json({ error: 'Missing session token' }, 400);

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase credentials missing' }, 500);

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('trade_sessions')
      .select('id, guild_id, user_id, game_key, status, created_at, expires_at, initial_data')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    const expired = data?.expires_at && new Date(data.expires_at).getTime() < Date.now();
    if (!data || data.status !== 'open' || expired) {
      return json({ error: 'Session not found or expired' }, 404);
    }

    return json({
      success: true,
      session: {
        token,
        guildId: data.guild_id,
        userId: data.user_id,
        gameKey: data.game_key,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        initialData: data.initial_data || null
      }
    });
  } catch (error) {
    console.error('[functions/api/trades/session] failed', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
