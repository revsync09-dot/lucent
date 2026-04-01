const { getTradeHistoryFromSession } = require('../../src/lib/supabase');

module.exports = async (req, res) => {
  const token = req.query.session || req.query.token;

  if (!token) {
    return res.status(400).json({ error: 'Session token is required' });
  }

  try {
    const history = await getTradeHistoryFromSession(token);
    return res.status(200).json({ success: true, history });
  } catch (err) {
    console.error('[api/trades/history] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
