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
  if (!token) return json({ error: 'Session token is required' }, 400);

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase credentials missing' }, 500);

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const sessionRes = await supabase
      .from('trade_sessions')
      .select('user_id')
      .eq('token', token)
      .maybeSingle();
    if (sessionRes.error) throw sessionRes.error;
    if (!sessionRes.data) return json({ error: 'Session not found' }, 404);

    const historyRes = await supabase
      .from('trade_posts')
      .select('*')
      .eq('user_id', sessionRes.data.user_id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (historyRes.error) throw historyRes.error;

    return json({ success: true, history: historyRes.data || [] });
  } catch (error) {
    console.error('[functions/api/trades/history] failed', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
