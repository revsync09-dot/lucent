const { getTradeSession } = require('../../src/lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.query.session || req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Missing session token' });
  }

  try {
    const session = await getTradeSession(token);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    return res.status(200).json({
      success: true,
      session: {
        token,
        guildId: session.guild_id,
        userId: session.user_id,
        gameKey: session.game_key,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
        initialData: session.initial_data || null
      }
    });
  } catch (err) {
    console.error('[api/trades/session] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

