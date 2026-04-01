import { createClient } from '@supabase/supabase-js';
import { publishTradePostToDiscord } from './_discord.js';

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

function resolveAvatarUrl(user) {
  if (user?.id && user?.avatar) {
    const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const index = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function syncVerifiedViewer(supabase, viewer) {
  if (!viewer?.id) return { is_verified: false };
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
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase credentials missing' }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await request.json().catch(() => ({}));
  const token = String(body.session || body.token || '').trim();
  const explicitGameKey = String(body.gameKey || '').trim().toUpperCase();
  const trading = String(body.trading || '').trim();
  const lookingFor = String(body.lookingFor || '').trim();
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  const selectedTrading = Array.isArray(body.selectedTrading) ? body.selectedTrading.slice(0, 30) : [];
  const selectedLooking = Array.isArray(body.selectedLooking) ? body.selectedLooking.slice(0, 30) : [];

  if (!trading || !lookingFor) {
    return json({ error: 'Trading and Looking For fields are required.' }, 400);
  }

  try {
    let guildId;
    let userId;
    let gameKey;
    let session = null;

    if (token) {
      const sessionRes = await supabase
        .from('trade_sessions')
        .select('id, guild_id, user_id, game_key, status, expires_at')
        .eq('token', token)
        .maybeSingle();
      if (sessionRes.error) throw sessionRes.error;
      session = sessionRes.data;
      const expired = session?.expires_at && new Date(session.expires_at).getTime() < Date.now();
      if (!session || session.status !== 'open' || expired) {
        return json({ error: 'Session not found or expired' }, 404);
      }
      guildId = session.guild_id;
      userId = session.user_id;
      gameKey = session.game_key;
    } else {
      const viewer = parseDiscordUser(request);
      if (!viewer?.id) return json({ error: 'Verify with Discord first.' }, 401);
      await syncVerifiedViewer(supabase, viewer);
      if (!explicitGameKey) return json({ error: 'Missing game key' }, 400);
      guildId = env.DISCORD_GUILD_ID;
      userId = viewer.id;
      gameKey = explicitGameKey;
    }

    const insertRes = await supabase
      .from('trade_posts')
      .insert({
        guild_id: String(guildId),
        user_id: String(userId),
        trading_item: trading,
        looking_for: lookingFor,
        game_key: String(gameKey),
        settings: { ...settings, selectedTrading, selectedLooking },
        status: 'open'
      })
      .select()
      .maybeSingle();
    if (insertRes.error) throw insertRes.error;

    if (session) {
      await supabase.from('trade_sessions').update({ status: 'used' }).eq('id', session.id);
    }

    if (insertRes.data) {
      const discordMessage = await publishTradePostToDiscord(env, insertRes.data).catch(() => null);
      if (discordMessage?.id) {
        await supabase.from('trade_posts').update({ message_id: discordMessage.id }).eq('id', insertRes.data.id);
      }
    }

    return json({
      success: true,
      tradeId: insertRes.data?.id,
      trade: {
        guildId,
        userId,
        gameKey,
        trading,
        lookingFor,
        settings
      }
    });
  } catch (error) {
    console.error('[functions/api/trades/create-from-session] failed', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
}
