const cookie = require('cookie');
const { env } = require('../../src/config');
const { supabase, getTradeSession, createTradePost, getUserProfile } = require('../../src/lib/supabase');

function parseDiscordUser(req) {
  const parsed = cookie.parse(req.headers.cookie || '');
  const raw = parsed.discord_user;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const token = String(body.session || body.token || '').trim();
  const explicitGameKey = String(body.gameKey || '').trim().toUpperCase();
  const trading = String(body.trading || '').trim();
  const lookingFor = String(body.lookingFor || '').trim();
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  const selectedTrading = Array.isArray(body.selectedTrading) ? body.selectedTrading.slice(0, 30) : [];
  const selectedLooking = Array.isArray(body.selectedLooking) ? body.selectedLooking.slice(0, 30) : [];

  if (!trading || !lookingFor) {
    return res.status(400).json({ error: 'Trading and Looking For fields are required.' });
  }

  try {
    let guildId;
    let userId;
    let gameKey;
    let session = null;

    if (token) {
      session = await getTradeSession(token);
      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }
      guildId = session.guild_id;
      userId = session.user_id;
      gameKey = session.game_key;
    } else {
      const viewer = parseDiscordUser(req);
      if (!viewer?.id) {
        return res.status(401).json({ error: 'Verify with Discord first.' });
      }
      const profile = await getUserProfile(viewer.id);
      if (!profile?.is_verified) {
        return res.status(403).json({ error: 'Only verified users can create trades on the website.' });
      }
      if (!explicitGameKey) {
        return res.status(400).json({ error: 'Missing game key' });
      }
      guildId = env.guildId;
      userId = viewer.id;
      gameKey = explicitGameKey;
    }

    const tradePost = await createTradePost(
      guildId,
      userId,
      trading, 
      lookingFor, 
      gameKey,
      {
        ...settings,
        selectedTrading,
        selectedLooking
      }
    );

    if (session && supabase) {
      await supabase
        .from('trade_sessions')
        .update({ status: 'used' })
        .eq('id', session.id)
        .catch(() => null);
    }

    // Notify Bot to post in Discord (Optional: if bot is in the same process)
    if (global.tradeBotClient) {
        const { publishTradeToDiscord } = require('../../src/lib/trade-manager');
        await publishTradeToDiscord(global.tradeBotClient, tradePost).catch(e => console.error('Bot post failed:', e));
    }

    return res.status(200).json({
      success: true,
      tradeId: tradePost?.id,
      trade: {
        guildId,
        userId,
        gameKey,
        trading,
        lookingFor,
        settings
      }
    });
  } catch (err) {
    console.error('[api/trades/create-from-session] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

