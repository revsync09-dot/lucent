const { createClient } = require('@supabase/supabase-js');
const url = require('url');

let userCache = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = process.env.DISCORD_TOKEN;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const queryObject = url.parse(req.url, true).query;
  
  const gameFilter = queryObject.game || null;
  const searchQuery = queryObject.search || null;
  const page = parseInt(queryObject.page) || 1;
  const limit = Math.min(parseInt(queryObject.limit) || 20, 100);
  const offset = (page - 1) * limit;

  try {
    // 1. Build Query
    let query = supabase
      .from('trade_posts')
      .select('*', { count: 'exact' })
      .in('status', ['open', 'accepted'])
      .order('created_at', { ascending: false });

    if (gameFilter) {
      query = query.eq('game_key', gameFilter);
    }

    if (searchQuery) {
      query = query.or(`trading_item.ilike.%${searchQuery}%,looking_for.ilike.%${searchQuery}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: trades, count, error } = await query;
    if (error) throw error;

    // 2. Fetch User Details & Reputation (with caching)
    const fetchUserCached = async (id) => {
      const now = Date.now();
      if (userCache.has(id)) {
        const cached = userCache.get(id);
        if (now - cached.time < 600000) return cached.data; // 10 min cache
      }

      try {
        const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
          headers: { Authorization: `Bot ${discordToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          userCache.set(id, { time: now, data });
          return data;
        }
      } catch (e) {
        // Fallback for failed fetch
      }
      return null;
    };

    const getReputation = async (id) => {
      const { count } = await supabase
        .from('vouches')
        .select('*', { count: 'exact', head: true })
        .eq('helper_user_id', id);
      return count || 0;
    };

    const enrichedTrades = await Promise.all(trades.map(async (t) => {
      const user = await fetchUserCached(t.user_id);
      const rep = await getReputation(t.user_id);
      
      return {
        id: t.id,
        userId: t.user_id,
        username: user?.username || `User-${t.user_id.substring(0, 5)}`,
        avatar: user?.avatar ? `https://cdn.discordapp.com/avatars/${t.user_id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
        gameKey: t.game_key,
        trading: t.trading_item,
        lookingFor: t.looking_for,
        trustScore: rep > 50 ? 'Elite' : (rep > 10 ? 'Trusted' : 'Member'),
        rep: rep,
        isVerified: rep > 5,
        settings: t.settings || {},
        createdAt: t.created_at
      };
    }));

    // 3. Stats calculation (optional, for "perfection")
    const { count: totalActive } = await supabase
        .from('trade_posts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86400000).toISOString());

    return res.status(200).json({ 
      success: true, 
      trades: enrichedTrades,
      meta: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
          recentActivity: totalActive || 0
      }
    });

  } catch (err) {
    console.error('[Trade API] Global Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
