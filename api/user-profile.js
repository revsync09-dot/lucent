const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { id } = req.query;

  if (!id) return res.status(400).json({ error: 'Missing user ID' });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [{ count: vouches }, { data: profile }] = await Promise.all([
      supabase
        .from('vouches')
        .select('*', { count: 'exact', head: true })
        .eq('helper_user_id', id),
      supabase
        .from('user_profiles')
        .select('is_verified, trust_score, reputation, username, avatar_url, verified_at')
        .eq('user_id', id)
        .maybeSingle()
    ]);

    const score = profile?.reputation ?? vouches ?? 0;
    let rank = 'Member';
    if (score > 100) rank = 'Elite';
    else if (score > 25) rank = 'Trusted';
    else if (score > 5) rank = 'Active';

    return res.status(200).json({
      id,
      username: profile?.username || null,
      avatarUrl: profile?.avatar_url || null,
      reputation: score,
      rank,
      trustScore: profile?.trust_score ?? Math.min(60 + (score * 2), 99),
      isVerified: Boolean(profile?.is_verified || score > 5),
      verifiedAt: profile?.verified_at || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
