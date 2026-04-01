const { createClient } = require('@supabase/supabase-js');
const { buildLeaderboardCard } = require('../src/lib/vouch-card');
const { getHelperRank } = require('../src/config');

module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {

    const { data: allVouches, error } = await supabase
      .from('vouches')
      .select('helper_user_id, rating, game_key');

    if (error) throw error;

    const byHelper = new Map();
    allVouches.forEach(v => {
      if (!byHelper.has(v.helper_user_id)) {
        byHelper.set(v.helper_user_id, {
          id: v.helper_user_id,
          total: 0,
          ratingSum: 0,
          fiveStars: 0,
          games: {}
        });
      }
      const h = byHelper.get(v.helper_user_id);
      h.total++;
      h.ratingSum += Number(v.rating) || 0;
      if (Number(v.rating) === 5) h.fiveStars++;
      h.games[v.game_key] = (h.games[v.game_key] || 0) + 1;
    });

    const entries = [...byHelper.values()]
      .map(h => {
        const topGame = Object.keys(h.games).sort((a, b) => h.games[b] - h.games[a])[0];
        return {
          helperId: h.id,
          helperTag: `User-${h.id.substring(0, 5)}`,
          total: h.total,
          average: h.ratingSum / h.total,
          fiveStarRate: (h.fiveStars / h.total) * 100,
          topGame: topGame,
          rankLabel: getHelperRank(h.total)
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const token = process.env.DISCORD_TOKEN;
    if (token) {
        await Promise.all(entries.map(async (e) => {
            try {
                const dRes = await fetch(`https://discord.com/api/v10/users/${e.helperId}`, {
                    headers: { Authorization: `Bot ${token}` }
                });
                if (dRes.ok) {
                    const u = await dRes.json();
                    e.helperTag = u.username;
                    if (u.avatar) {
                        e.avatarUrl = `https://cdn.discordapp.com/avatars/${e.helperId}/${u.avatar}.png?size=128`;
                    }
                } else {

                    const KNOWN = {
                        "1246695716852858973": "acedd._",
                        "732668417714290718": "skyblueyeet",
                        "907364889255870514": "adominican"
                    };
                    if (KNOWN[e.helperId]) e.helperTag = KNOWN[e.helperId];
                }
            } catch (err) {}
        }));
    }

    const { buffer } = await buildLeaderboardCard({
      guildName: 'Hyperions Network',
      entries
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(buffer);

  } catch (err) {
    console.error('[LeaderboardCardAPI] Error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
};