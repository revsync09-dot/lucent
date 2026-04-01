const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const { buildHelperProfileCard } = require('../src/lib/vouch-card');
const { getHelperRank } = require('../src/config');

module.exports = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  console.log(`[HelperCard] Generating for ${userId}...`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {

    const { data: vouches, error: vError } = await supabase
      .from('vouches')
      .select('rating, game_key')
      .eq('helper_user_id', userId);

    if (vError) throw vError;

    const total = vouches?.length || 0;
    const avg = total > 0 ? vouches.reduce((sum, v) => sum + (Number(v.rating) || 0), 0) / total : 0;
    const fiveStars = total > 0 ? vouches.filter(v => Number(v.rating) === 5).length : 0;
    const fiveStarRate = total > 0 ? (fiveStars / total) * 100 : 0;

    const gameCounts = {};
    if (vouches) {
      vouches.forEach(v => {
        gameCounts[v.game_key] = (gameCounts[v.game_key] || 0) + 1;
      });
    }
    const topGame = Object.keys(gameCounts).sort((a, b) => gameCounts[b] - gameCounts[a])[0] || 'General';

    let username = 'Unknown Helper';
    let avatarUrl = 'https://discord.com/embed/avatars/0.png';
    const token = process.env.DISCORD_TOKEN;

    if (token) {
      try {
        const discordRes = await fetch(`https://discord.com/api/v10/users/${userId}`, {
          headers: { Authorization: `Bot ${token}` }
        });
        if (discordRes.ok) {
          const u = await discordRes.json();
          username = u.username || u.tag;
          if (u.avatar) {
            avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.png?size=256`;
          }
        }
      } catch (e) {
        console.error('[HelperCard] Discord API error:', e.message);
      }
    }

    let rank = '—';
    try {
      const { data: allVouches } = await supabase.from('vouches').select('helper_user_id');
      if (allVouches) {
        const leaderCounts = {};
        allVouches.forEach(v => {
          leaderCounts[v.helper_user_id] = (leaderCounts[v.helper_user_id] || 0) + 1;
        });
        const sorted = Object.keys(leaderCounts).sort((a,b) => leaderCounts[b] - leaderCounts[a]);
        const rIdx = sorted.indexOf(userId);
        if (rIdx !== -1) rank = rIdx + 1;
      }
    } catch (e) {
      console.error('[HelperCard] Rank calc error:', e.message);
    }

    console.log(`[HelperCard] Building card for ${username} (Rank: ${rank}, Vouches: ${total})`);

    const cardData = {
      helperTag: username,
      helperId: userId,
      avatarUrl: avatarUrl,
      rank: rank,
      rankLabel: getHelperRank(total),
      total: total,
      average: Number(avg.toFixed(2)),
      fiveStarRate: Number(fiveStarRate.toFixed(1)),
      topGame: topGame,
      weeklyVouches: 0,
      monthlyVouches: 0
    };

    const { buffer } = await buildHelperProfileCard(cardData);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    console.log(`[HelperCard] Success! Sending buffer (${buffer.length} bytes)`);
    return res.status(200).send(buffer);

  } catch (err) {
    console.error('[HelperCard] Critical Error:', err);
    return res.status(500).json({
      error: 'Generation Failed',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
