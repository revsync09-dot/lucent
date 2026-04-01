const { createClient } = require('@supabase/supabase-js');

const GAME_META = {
  ALS: { label: 'Anime Last Stand', emojiId: process.env.EMOJI_SERVICE_ALS_ID || process.env.EMOJI_SERVICE_RAIDS_ID || '' },
  AG: { label: 'Anime Guardians', emojiId: process.env.EMOJI_SERVICE_AG_ID || process.env.EMOJI_SERVICE_RACEV4_ID || '' },
  AC: { label: 'Anime Crusaders', emojiId: process.env.EMOJI_SERVICE_AC_ID || process.env.EMOJI_SERVICE_LEVI_ID || '' },
  AV: { label: 'Anime Vanguards', emojiId: process.env.EMOJI_SERVICE_AV_ID || '' },
  UTD: { label: 'Universal Tower Defense', emojiId: process.env.EMOJI_SERVICE_UTD_ID || '' },
  ARX: {
    label: 'Anime Rangers X',
    emojiId:
      process.env.EMOJI_SERVICE_ARX_ID ||
      process.env.EMOJI_SERVICE_ARX ||
      process.env.EMOJI_SERVICE_ANIMERANGERSX_ID ||
      process.env.EMOJI_SERVICE_ANIME_RANGERS_X_ID ||
      ''
  },
  BL: { label: 'Bizarre Lineage', emojiId: process.env.EMOJI_SERVICE_BL_ID || '' },
  SP: { label: 'Sailor Piece', emojiId: process.env.EMOJI_SERVICE_SP_ID || process.env.EMOJI_SERVICE_AP_ID || '' },
  ASTD: { label: 'All Star Tower Defense', emojiId: process.env.EMOJI_SERVICE_ASTD_ID || '' }
};

function buildEmojiUrl(id) {
  return /^\d{17,20}$/.test(String(id || '').trim())
    ? `https://cdn.discordapp.com/emojis/${String(id).trim()}.webp?size=128&quality=lossless`
    : null;
}

// Simple in-memory cache for Discord user data to prevent 429s (Rate Limits)
let userCache = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: statusData, error: statusError } = await supabase
      .from('bot_status')
      .select('*')
      .eq('id', 'main')
      .single();

    if (statusError && statusError.code !== 'PGRST116') throw statusError;

    const { data: voucherRows } = await supabase
      .from('vouches')
      .select('helper_user_id, rating, game_key');

    const { data: presenceRows } = await supabase
      .from('helper_presence')
      .select('game_key')
      .eq('guild_id', process.env.DISCORD_GUILD_ID || '')
      .eq('is_online', true);

    let leaderboard = [];
    if (voucherRows) {
      const byHelper = new Map();
      for (const row of voucherRows) {
        const hId = row.helper_user_id;
        if (!byHelper.has(hId)) byHelper.set(hId, { id: hId, total: 0, ratingSum: 0 });
        const item = byHelper.get(hId);
        item.total += 1;
        item.ratingSum += Number(row.rating) || 0;
      }
      leaderboard = [...byHelper.values()]
        .map(h => ({
          helperId: h.id,
          total: h.total,
          average: Number((h.ratingSum / h.total).toFixed(1))
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    }

    const helperPresence = Object.fromEntries(Object.keys(GAME_META).map((key) => [key, 0]));
    for (const row of presenceRows || []) {
      if (row.game_key && Object.prototype.hasOwnProperty.call(helperPresence, row.game_key)) {
        helperPresence[row.game_key] += 1;
      }
    }

    const gamePresence = Object.fromEntries(
      Object.entries(GAME_META).map(([key, meta]) => [
        key,
        {
          key,
          label: meta.label,
          available: helperPresence[key] || 0,
          status: (helperPresence[key] || 0) > 0 ? 'ONLINE' : 'OFFLINE',
          emojiId: meta.emojiId,
          emojiUrl: buildEmojiUrl(meta.emojiId)
        }
      ])
    );

    const discordToken = process.env.DISCORD_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    let staffTeam = [];

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
        if (res.status === 429) {
          console.warn(`[API Status] Rate limited on /users/${id}`);
          // Return stale cache if available, else null
          return userCache.has(id) ? userCache.get(id).data : null;
        }
      } catch (e) {
        console.error(`[API Status] Discord fetch error: ${e.message}`);
      }
      return null;
    };

    if (discordToken && guildId) {
      // 1. Get Guild for owner check (briefly cached if needed, but guild is usually 1 fetch)
      const gRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: { Authorization: `Bot ${discordToken}` }
      });
      const guild = gRes.ok ? await gRes.json() : null;

      const KNOWN_STAFF_MAP = {
        "795466540140986368": { username: "Red_thz", role: "Developer of the Bots", tags: ["Developer"], avatar: "avatar_1.png", badge: "Staff" },
        "401253381579997185": { username: "officalkeyz", role: "Owner of the Server", tags: ["Owner"], avatar: "avatar_2.gif", badge: "Owner" },
        "349547775098355712": { username: "knownasevil", role: "Community Owner", tags: ["Community"], avatar: "avatar_3.png", badge: "Staff" },
        "470266420928839680": { username: "xygnk", role: "Administration Team", tags: ["Administration"], avatar: "avatar_4.png", badge: "Staff" },
        "664502685998907403": { username: "breezyinit", role: "Administration Team", tags: ["Administration"], avatar: "avatar_5.png", badge: "Staff" },
        "1124405902796136469": { username: "avrora.light", role: "Administration Team", tags: ["Administration"], avatar: "avatar_6.png", badge: "Staff" },
        "123456789012345678": { username: "yuki_shirafty", role: "Administration Team", tags: ["Administration"], avatar: "avatar_7.png", badge: "Staff" },
        "732668417714290718": { username: "skyblueyeet", role: "Senior Moderator", tags: ["Moderation"], avatar: "avatar_8.png", badge: "Staff" },
        "1472804265809674427": { username: "najdis_notpreety", role: "Moderator", tags: ["Moderation"], avatar: "avatar_9.png", badge: "Staff" },
        "907364889255870514": { username: "adominican", role: "Moderator", tags: ["Moderation"], avatar: "avatar_10.png", badge: "Staff" }
      };

      const finalStaffIds = Object.keys(KNOWN_STAFF_MAP);

      for (const id of finalStaffIds) {
        const fallback = KNOWN_STAFF_MAP[id];
        // Only fetch from Discord if we don't have a reliable username locally
        // or if we really need a live avatar. To save rate limits, we use fallback heavily.
        let u = null;
        if (!fallback.username) {
            u = await fetchUserCached(id);
        }

        let avatarUrl = `/assets/avatars/${fallback.avatar || 'avatar_1.png'}`;
        
        staffTeam.push({
          id,
          username: fallback.username || u?.username || `User-${id.substring(0, 5)}`,
          avatar: avatarUrl,
          role: fallback.role || 'Staff Member',
          badge: fallback.badge || 'Staff',
          tags: fallback.tags || ['Staff']
        });
      }
    }

    // Process Leaderboard with caching
    if (discordToken && leaderboard.length > 0) {
      const userDetails = await Promise.all(leaderboard.map(h => fetchUserCached(h.helperId)));
      leaderboard = leaderboard.map((h, i) => {
        const user = userDetails[i];
        return {
          ...h,
          username: user?.username || `User-${h.helperId.substring(0, 4)}`,
          avatar: user?.avatar ? `https://cdn.discordapp.com/avatars/${h.helperId}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
        };
      });
    }

    const response = {
      status: statusData?.status || 'operational',
      uptime: statusData?.uptime || 0,
      ping: statusData?.ping || -1,
      guilds: statusData?.guilds || 0,
      tickets: statusData?.tickets || 0,
      vouches: statusData?.vouches || 0,
      ram: statusData?.ram || 0,
      cpu: statusData?.cpu || 0,
      version: 'v3.5.0 (Stable)',
      dbOnline: true,
      timestamp: statusData?.last_update || new Date().toISOString(),
      leaderboard,
      staffTeam,
      helperPresence,
      gamePresence,
      emojis: {
        website: {
          uptime: process.env.EMOJI_WEBSITE_UPTIME_ID || '1481801619539755008',
          ping: process.env.EMOJI_WEBSITE_PING_ID || '1481801566070505572',
          tickets: process.env.EMOJI_WEBSITE_TICKETS_ID || '1481801672417349846',
          vouches: process.env.EMOJI_WEBSITE_VOUCHES_ID || '1481801736724152331',
          rules: process.env.EMOJI_WEBSITE_RULES_ID || '1481801790075699324',
          payment: process.env.EMOJI_WEBSITE_PAYMENT_ID || '1481801844672958486',
          quota: process.env.EMOJI_WEBSITE_QUOTA_ID || '1481801910402023444',
          info: process.env.EMOJI_WEBSITE_INFO_ID || '1481802050479325275',
          bot: process.env.EMOJI_LOG_ID || '1478176828488290424',
          n01: process.env.EMOJI_WEBSITE_NUMBER_01_ID || '1481802104291983492',
          n02: process.env.EMOJI_WEBSITE_NUMBER_02_ID || '1481802157442469988',
          n03: process.env.EMOJI_WEBSITE_NUMBER_03_ID || '1481802198760554588'
        }
      }
    };

    if (typeof res.status === 'function') {
        return res.status(200).json(response);
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
  } catch (err) {
    console.error('Vercel API Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
