const cookie = require('cookie');
const { getUserProfile, getTradePostById } = require('../../src/lib/supabase');
const { openTradeMatch } = require('../../src/lib/trade-manager');

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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const viewer = parseDiscordUser(req);
  if (!viewer?.id) {
    return res.status(401).json({ success: false, error: 'You must verify with Discord first.' });
  }

  const body = req.body || {};
  const tradeId = String(body.tradeId || '').trim();
  const note = String(body.note || '').trim();
  const accepterItems = Array.isArray(body.accepterItems) ? body.accepterItems : [];

  if (!tradeId) {
    return res.status(400).json({ success: false, error: 'Missing trade ID' });
  }

  try {
    const [profile, trade] = await Promise.all([
      getUserProfile(viewer.id),
      getTradePostById(tradeId)
    ]);

    if (!trade) {
      return res.status(404).json({ success: false, error: 'Trade offer not found.' });
    }
    if (trade.user_id === viewer.id) {
      return res.status(400).json({ success: false, error: 'You cannot accept your own trade.' });
    }
    if (trade.status && !['open', 'accepted'].includes(trade.status)) {
      return res.status(400).json({ success: false, error: 'Trade is no longer available.' });
    }
    if (trade.settings?.verifiedOnly && !profile?.is_verified) {
      return res.status(403).json({ success: false, error: 'This trade is limited to verified traders.' });
    }
    if (!global.tradeBotClient) {
      return res.status(503).json({ success: false, error: 'Trade bot is not connected right now.' });
    }

    const result = await openTradeMatch(global.tradeBotClient, trade, viewer.id, { note, accepterItems });
    return res.status(200).json({
      success: true,
      matchId: result.match?.id,
      threadId: result.threadId
    });
  } catch (error) {
    console.error('[api/trades/match] Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};
