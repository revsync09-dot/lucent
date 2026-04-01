import { createClient } from '@supabase/supabase-js';

const GAME_META = {
  ALS: { label: 'Anime Last Stand', emojiIdKey: 'EMOJI_SERVICE_ALS_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_RAIDS_ID' },
  AG: { label: 'Anime Guardians', emojiIdKey: 'EMOJI_SERVICE_AG_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_RACEV4_ID' },
  AC: { label: 'Anime Crusaders', emojiIdKey: 'EMOJI_SERVICE_AC_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_LEVI_ID' },
  AV: { label: 'Anime Vanguards', emojiIdKey: 'EMOJI_SERVICE_AV_ID' },
  UTD: { label: 'Universal Tower Defense', emojiIdKey: 'EMOJI_SERVICE_UTD_ID' },
  ARX: {
    label: 'Anime Rangers X',
    emojiIdKey: 'EMOJI_SERVICE_ARX_ID',
    fallbackEmojiIdKey: 'EMOJI_SERVICE_ARX'
  },
  BL: { label: 'Bizarre Lineage', emojiIdKey: 'EMOJI_SERVICE_BL_ID' },
  SP: { label: 'Sailor Piece', emojiIdKey: 'EMOJI_SERVICE_SP_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_AP_ID' },
  ASTD: { label: 'All Star Tower Defense', emojiIdKey: 'EMOJI_SERVICE_ASTD_ID' }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json'
    }
  });
}

function buildEmojiUrl(id) {
  return /^\d{17,20}$/.test(String(id || '').trim())
    ? `https://cdn.discordapp.com/emojis/${String(id).trim()}.webp?size=128&quality=lossless`
    : null;
}

function buildGamePresence(env, counts) {
  return Object.fromEntries(
    Object.entries(GAME_META).map(([key, meta]) => {
      const emojiId = env[meta.emojiIdKey] || (meta.fallbackEmojiIdKey ? env[meta.fallbackEmojiIdKey] : '') || '';
      const available = Number(counts[key] || 0);
      return [
        key,
        {
          key,
          label: meta.label,
          available,
          status: available > 0 ? 'ONLINE' : 'OFFLINE',
          emojiId,
          emojiUrl: buildEmojiUrl(emojiId)
        }
      ];
    })
  );
}

export async function onRequest(context) {
  const { env } = context;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase credentials missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const discordToken = env.DISCORD_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  try {
    const [statusRes, voucherRes, presenceRes] = await Promise.all([
      supabase.from('bot_status').select('*').eq('id', 'main').single(),
      supabase.from('vouches').select('helper_user_id, rating, game_key'),
      supabase.from('helper_presence').select('game_key').eq('guild_id', guildId || '').eq('is_online', true)
    ]);

    if (statusRes.error && statusRes.error.code !== 'PGRST116') {
      throw statusRes.error;
    }
    if (voucherRes.error) throw voucherRes.error;
    if (presenceRes.error) throw presenceRes.error;

    const statusData = statusRes.data;
    const voucherRows = voucherRes.data || [];

    let leaderboard = [];
    if (voucherRows.length) {
      const byHelper = new Map();
      for (const row of voucherRows) {
        const helperId = row.helper_user_id;
        if (!byHelper.has(helperId)) byHelper.set(helperId, { helperId, total: 0, ratingSum: 0 });
        const current = byHelper.get(helperId);
        current.total += 1;
        current.ratingSum += Number(row.rating) || 0;
      }
      leaderboard = [...byHelper.values()]
        .map((entry) => ({
          helperId: entry.helperId,
          total: entry.total,
          average: Number((entry.ratingSum / entry.total).toFixed(1))
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    }

    const helperPresence = Object.fromEntries(Object.keys(GAME_META).map((key) => [key, 0]));
    for (const row of presenceRes.data || []) {
      if (row.game_key && Object.prototype.hasOwnProperty.call(helperPresence, row.game_key)) {
        helperPresence[row.game_key] += 1;
      }
    }
    const gamePresence = buildGamePresence(env, helperPresence);

    const fetchDiscord = async (path) => {
      if (!discordToken) return null;
      try {
        const res = await fetch(`https://discord.com/api/v10${path}`, {
          headers: { Authorization: `Bot ${discordToken}` }
        });
        if (res.ok) return await res.json();
      } catch (_) {}
      return null;
    };

    let staffTeam = [];
    if (env.STAFF_TEAM_JSON) {
      try {
        staffTeam = JSON.parse(env.STAFF_TEAM_JSON).map((member) => ({
          ...member,
          avatar: member.avatar && (member.avatar.startsWith('http') || member.avatar.startsWith('/'))
            ? member.avatar
            : `/assets/avatars/${member.avatar || 'avatar_1.png'}`
        }));
      } catch (_) {}
    }

    if (!staffTeam.length && guildId) {
      const fallbackStaff = {
        '795466540140986368': { username: 'Red_thz', role: 'Developer of the Bots', tags: ['Developer'], avatar: '/assets/avatars/avatar_1.png', badge: 'Staff' },
        '401253381579997185': { username: 'officalkeyz', role: 'Owner of the Server', tags: ['Owner'], avatar: '/assets/avatars/avatar_2.gif', badge: 'Owner' }
      };
      staffTeam = Object.entries(fallbackStaff).map(([id, info]) => ({ id, ...info }));
    }

    if (discordToken && leaderboard.length) {
      const userDetails = await Promise.all(leaderboard.map((entry) => fetchDiscord(`/users/${entry.helperId}`)));
      leaderboard = leaderboard.map((entry, index) => {
        const user = userDetails[index];
        return {
          ...entry,
          username: user?.username || `User-${entry.helperId.slice(0, 4)}`,
          avatar: user?.avatar
            ? `https://cdn.discordapp.com/avatars/${entry.helperId}/${user.avatar}.png?size=128`
            : 'https://cdn.discordapp.com/embed/avatars/0.png'
        };
      });
    }

    return json({
      status: statusData?.status || 'operational',
      uptime: statusData?.uptime || 0,
      ping: statusData?.ping || -1,
      guilds: statusData?.guilds || 0,
      tickets: statusData?.tickets || 0,
      vouches: statusData?.vouches || 0,
      ram: statusData?.ram || 0,
      cpu: statusData?.cpu || 0,
      version: 'v3.5.1 (Cloudflare Sync)',
      dbOnline: true,
      timestamp: statusData?.last_update || new Date().toISOString(),
      leaderboard,
      staffTeam,
      helperPresence,
      gamePresence,
      emojis: {
        website: {
          uptime: env.EMOJI_WEBSITE_UPTIME_ID || '1481801619539755008',
          ping: env.EMOJI_WEBSITE_PING_ID || '1481801566070505572',
          tickets: env.EMOJI_WEBSITE_TICKETS_ID || '1481801672417349846',
          vouches: env.EMOJI_WEBSITE_VOUCHES_ID || '1481801736724152331',
          rules: env.EMOJI_WEBSITE_RULES_ID || '1481801790075699324',
          payment: env.EMOJI_WEBSITE_PAYMENT_ID || '1481801844672958486',
          quota: env.EMOJI_WEBSITE_QUOTA_ID || '1481801910402023444',
          info: env.EMOJI_WEBSITE_INFO_ID || '1481802050479325275',
          bot: env.EMOJI_LOG_ID || '1478176828488290424',
          n01: env.EMOJI_WEBSITE_NUMBER_01_ID || '1481802104291983492',
          n02: env.EMOJI_WEBSITE_NUMBER_02_ID || '1481802157442469988',
          n03: env.EMOJI_WEBSITE_NUMBER_03_ID || '1481802198760554588'
        }
      }
    });
  } catch (error) {
    console.error('[functions/api/status] failed', error);
    return json({ error: 'Internal Server Error', message: error.message }, 500);
  }
}
