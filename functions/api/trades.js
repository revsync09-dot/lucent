const { supabase } = require('../../src/lib/supabase');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: trades, error } = await supabase
      .from('trade_posts')
      .select(`
        *,
        user_profiles (
          is_verified,
          trust_score,
          reputation
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      trades: trades.map(t => ({
        id: t.id,
        userId: t.user_id,
        trading: t.trading_item,
        lookingFor: t.looking_for,
        createdAt: t.created_at,
        isVerified: t.user_profiles?.is_verified || false,
        trustScore: t.user_profiles?.trust_score || 50,
        reputation: t.user_profiles?.reputation || 0
      }))
    });
  } catch (error) {
    console.error('[api/trades] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
