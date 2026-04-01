import { createClient } from '@supabase/supabase-js';
import { createTradeThreadAndPost } from './_discord.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json'
    }
  });
}

function parseDiscordUser(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)discord_user=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function parseTradeItems(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function resolveAvatarUrl(user) {
  if (user?.id && user?.avatar) {
    const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const index = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function syncVerifiedViewer(supabase, viewer) {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: String(viewer.id),
      username: viewer.username || 'Discord User',
      avatar_url: resolveAvatarUrl(viewer),
      is_verified: true,
      verified_at: new Date().toISOString()
    })
    .select('is_verified')
    .maybeSingle();
  if (error) throw error;
  return data || { is_verified: true };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return json({}, 200);
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ success: false, error: 'Supabase credentials missing' }, 500);

  const viewer = parseDiscordUser(request);
  if (!viewer?.id) return json({ success: false, error: 'You must verify with Discord first.' }, 401);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await request.json().catch(() => ({}));
  const tradeId = String(body.tradeId || '').trim();
  const note = String(body.note || '').trim();
  const accepterItems = Array.isArray(body.accepterItems) ? body.accepterItems : [];

  if (!tradeId) return json({ success: false, error: 'Missing trade ID' }, 400);

  try {
    const [profileRes, tradeRes] = await Promise.all([
      syncVerifiedViewer(supabase, viewer),
      supabase.from('trade_posts').select('*').eq('id', tradeId).maybeSingle()
    ]);
    if (tradeRes.error) throw tradeRes.error;

    const trade = tradeRes.data;
    if (!trade) return json({ success: false, error: 'Trade offer not found.' }, 404);
    if (trade.user_id === viewer.id) return json({ success: false, error: 'You cannot accept your own trade.' }, 400);
    if (trade.status && !['open', 'accepted'].includes(trade.status)) {
      return json({ success: false, error: 'Trade is no longer available.' }, 400);
    }
    if (trade.settings?.verifiedOnly && !profileRes?.is_verified) {
      return json({ success: false, error: 'This trade is limited to verified traders.' }, 403);
    }

    let matchRes = await supabase
      .from('trade_matches')
      .select('*')
      .eq('trade_post_id', tradeId)
      .eq('accepter_user_id', String(viewer.id))
      .in('status', ['accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (matchRes.error) throw matchRes.error;

    let match = matchRes.data;
    if (!match) {
      const createRes = await supabase
        .from('trade_matches')
        .insert({
          trade_post_id: trade.id,
          guild_id: trade.guild_id,
          owner_user_id: trade.user_id,
          accepter_user_id: String(viewer.id),
          game_key: trade.game_key,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          owner_items: parseTradeItems(trade.trading_item),
          accepter_items: accepterItems.length ? accepterItems : parseTradeItems(note),
          note: note || null
        })
        .select()
        .maybeSingle();
      if (createRes.error) throw createRes.error;
      match = createRes.data;
    }

    let threadId = match.discord_thread_id || trade.thread_id || null;
    if (!threadId) {
      const thread = await createTradeThreadAndPost(env, trade, match);
      threadId = thread.id;
      await supabase.from('trade_matches').update({
        discord_thread_id: thread.id,
        status: 'in_progress',
        updated_at: new Date().toISOString()
      }).eq('id', match.id);
      await supabase.from('trade_posts').update({
        thread_id: thread.id,
        status: 'accepted',
        matched_by: String(viewer.id),
        matched_at: new Date().toISOString()
      }).eq('id', trade.id);
    }

    return json({
      success: true,
      matchId: match.id,
      threadId
    });
  } catch (error) {
    console.error('[functions/api/trades/match] failed', error);
    return json({ success: false, error: error.message || 'Internal server error' }, 500);
  }
}
