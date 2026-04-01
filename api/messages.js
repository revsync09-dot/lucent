const { createClient } = require('@supabase/supabase-js');

const PAGE_SIZE = 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const userCache = new Map();

function getDefaultAvatar(userId, discriminator = '0') {
  const index = discriminator && discriminator !== '0'
    ? Number(discriminator) % 5
    : Number(BigInt(userId || '0') >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function resolveAvatarUrl(userId, payload, guildId) {
  if (!payload) return getDefaultAvatar(userId);
  if (payload.guild_avatar) {
    const ext = payload.guild_avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${payload.guild_avatar}.${ext}?size=128`;
  }
  if (payload.avatar) {
    const ext = payload.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${payload.avatar}.${ext}?size=128`;
  }
  return getDefaultAvatar(userId, payload.discriminator);
}

async function fetchUser(userId, guildId, discordToken) {
  if (!discordToken || !userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);

  const headers = { Authorization: `Bot ${discordToken}` };
  let payload = null;

  try {
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers });
    if (memberRes.ok) {
      const member = await memberRes.json();
      if (member?.user) {
        payload = {
          ...member.user,
          guild_avatar: member.avatar,
          nick: member.nick || null
        };
      }
    }
  } catch (error) {
    console.error(`[api/messages] Discord member fetch error for ${userId}:`, error.message);
  }

  if (!payload) {
    try {
      const userRes = await fetch(`https://discord.com/api/v10/users/${userId}`, { headers });
      if (userRes.ok) payload = await userRes.json();
      else if (userRes.status === 429) console.warn(`[api/messages] Discord rate limited for ${userId}`);
    } catch (error) {
      console.error(`[api/messages] Discord user fetch error for ${userId}:`, error.message);
    }
  }

  if (payload) userCache.set(userId, payload);
  return payload;
}

async function fetchAllRows(supabase, table, columns, buildQuery) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns);
    query = buildQuery(query).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function startOfUtcHour(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function startOfUtcHalfHour(date) {
  const d = new Date(date);
  d.setUTCMinutes(d.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
  return d;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeEmojiValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const discordMarkup = raw.match(/^<a?:[\w-]+:(\d{17,20})>$/);
  if (discordMarkup) return discordMarkup[1];
  const nameIdPair = raw.match(/^[\w-]+:(\d{17,20})$/);
  return nameIdPair ? nameIdPair[1] : raw;
}

function resolveVcDurationMinutes(row, now) {
  let duration = Number(row?.duration_minutes) || 0;
  if (!row?.left_at && row?.joined_at) {
    const start = new Date(row.joined_at).getTime();
    if (!Number.isNaN(start)) {
      duration = Math.max(duration, Math.floor((now.getTime() - start) / 60000));
    }
  }
  return duration;
}

function distributeVcSession(row, now, bucketStart, bucketSizeMs, bucketCount, vcMinPerBucket, usersInBucketSet) {
  if (!row?.joined_at) return;

  const joinedAtMs = new Date(row.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return;

  let leftAtMs = row.left_at ? new Date(row.left_at).getTime() : now.getTime();
  if (Number.isNaN(leftAtMs)) leftAtMs = now.getTime();
  if (leftAtMs <= joinedAtMs) return;

  const overallStartMs = bucketStart.getTime();
  const overallEndMs = overallStartMs + (bucketCount * bucketSizeMs);
  const clippedStart = Math.max(joinedAtMs, overallStartMs);
  const clippedEnd = Math.min(leftAtMs, overallEndMs);

  if (clippedEnd <= clippedStart) return;

  const startBucketIndex = Math.max(0, Math.floor((clippedStart - overallStartMs) / bucketSizeMs));
  const endBucketIndex = Math.min(bucketCount - 1, Math.floor((clippedEnd - overallStartMs - 1) / bucketSizeMs));

  for (let idx = startBucketIndex; idx <= endBucketIndex; idx++) {
    const bucketFrom = overallStartMs + (idx * bucketSizeMs);
    const bucketTo = bucketFrom + bucketSizeMs;
    const overlapMs = Math.max(0, Math.min(clippedEnd, bucketTo) - Math.max(clippedStart, bucketFrom));
    if (!overlapMs) continue;
    vcMinPerBucket[idx] += overlapMs / 60000;
    if (row.user_id) usersInBucketSet[idx].add(row.user_id);
  }
}

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
  const guildId = req.query.guildId || process.env.DISCORD_GUILD_ID || '1422969507734884374';

  const emojis = {
    messages: process.env.EMOJI_MESSAGES || 'ðŸ’¬',
    deleted: process.env.EMOJI_DELETED || 'ðŸ—‘ï¸',
    vc: process.env.EMOJI_VC || 'ðŸ”Š',
    channels: process.env.EMOJI_CHANNELS || '#',
    users: process.env.EMOJI_USERS || 'ðŸ‘¥',
    chart: process.env.EMOJI_CHART || 'ðŸ“ˆ',
    wave: process.env.EMOJI_WAVE || 'ðŸŒŠ',
    activity: process.env.EMOJI_ACTIVITY || 'ðŸ“Š',
    growth: process.env.EMOJI_GROWTH || 'ðŸ“ˆ',
    joins: process.env.EMOJI_JOINS || 'ðŸ“ˆ',
    leaves: process.env.EMOJI_LEAVES || 'ðŸ“‰',
    text: process.env.EMOJI_TEXT || 'ðŸ’¬',
    boardUsers: process.env.EMOJI_BOARD_USERS || 'ðŸ‘¤',
    boardChannels: process.env.EMOJI_BOARD_CHANNELS || '#',
    boardVc: process.env.EMOJI_BOARD_VC || 'ðŸŽ™ï¸'
  };

  Object.keys(emojis).forEach((key) => {
    emojis[key] = normalizeEmojiValue(emojis[key]);
  });

  try {
    const range = req.query.range || '30d';
    const now = new Date();
    let daysBack = 30;
    if (range === '7d') daysBack = 7;
    else if (range === '24h') daysBack = 1;
    else if (range === 'all') daysBack = 365;

    let bucketCount = daysBack;
    let bucketUnit = 'day';
    let bucketSizeMs = DAY_MS;
    let endBucketStart = startOfUtcDay(now);

    if (range === '24h') {
      bucketCount = 48;
      bucketUnit = 'halfHour';
      bucketSizeMs = HALF_HOUR_MS;
      endBucketStart = startOfUtcHalfHour(now);
    } else if (range === '7d') {
      bucketCount = 7 * 24;
      bucketUnit = 'hour';
      bucketSizeMs = HOUR_MS;
      endBucketStart = startOfUtcHour(now);
    }
    let bucketStart = new Date(endBucketStart.getTime() - ((bucketCount - 1) * bucketSizeMs));

    const sinceIso = bucketStart.toISOString();

    const [msgRows, vcRows, growthRows, totalMessagesRes, totalDeletedRes] = await Promise.all([
      fetchAllRows(
        supabase,
        'server_messages',
        'sent_at, channel_id, channel_name, user_id, username, deleted',
        (query) => query
          .gte('sent_at', sinceIso)
          .eq('guild_id', guildId)
          .order('sent_at', { ascending: true })
      ),
      fetchAllRows(
        supabase,
        'vc_sessions',
        'user_id, username, joined_at, left_at, duration_minutes',
        (query) => query
          .gte('joined_at', sinceIso)
          .eq('guild_id', guildId)
          .order('joined_at', { ascending: true })
      ),
      fetchAllRows(
        supabase,
        'guild_growth',
        'event_type, created_at',
        (query) => query
          .gte('created_at', sinceIso)
          .eq('guild_id', guildId)
          .order('created_at', { ascending: true })
      ),
      fetchAllRows(
        supabase,
        'server_messages',
        '*',
        (query) => query.eq('guild_id', guildId).eq('deleted', false)
      ).then(rows => ({ count: rows.length })),
      fetchAllRows(
        supabase,
        'server_messages',
        '*',
        (query) => query.eq('guild_id', guildId).eq('deleted', true)
      ).then(rows => ({ count: rows.length }))
    ]);

    const labels = [];
    const msgPerBucket = new Array(bucketCount).fill(0);
    const deletedPerBucket = new Array(bucketCount).fill(0);
    const vcMinPerBucket = new Array(bucketCount).fill(0);
    const joinsPerBucket = new Array(bucketCount).fill(0);
    const leavesPerBucket = new Array(bucketCount).fill(0);
    const usersInBucketSet = Array.from({ length: bucketCount }, () => new Set());
    const channelsInBucketSet = Array.from({ length: bucketCount }, () => new Set());

    for (let i = 0; i < bucketCount; i++) {
      labels.push(new Date(bucketStart.getTime() + (i * bucketSizeMs)).toISOString());
    }

    const mapIntoBuckets = (rows, timestampField, targetArr, callback) => {
      for (const row of rows || []) {
        const rawValue = row[timestampField];
        if (!rawValue) continue;
        const dt = new Date(rawValue);
        if (Number.isNaN(dt.getTime())) continue;
        const idx = Math.floor((dt.getTime() - bucketStart.getTime()) / bucketSizeMs);
        if (idx < 0 || idx >= bucketCount) continue;
        if (callback) callback(row, idx);
        else targetArr[idx] += 1;
      }
    };

    mapIntoBuckets(msgRows, 'sent_at', null, (row, idx) => {
      if (row.deleted) {
        deletedPerBucket[idx] += 1;
        return;
      }

      msgPerBucket[idx] += 1;
      if (row.user_id) usersInBucketSet[idx].add(row.user_id);
      if (row.channel_id) channelsInBucketSet[idx].add(row.channel_id);
    });

    for (const row of vcRows) {
      distributeVcSession(row, now, bucketStart, bucketSizeMs, bucketCount, vcMinPerBucket, usersInBucketSet);
    }

    mapIntoBuckets(growthRows, 'created_at', null, (row, idx) => {
      if (row.event_type === 'join') joinsPerBucket[idx] += 1;
      else if (row.event_type === 'leave') leavesPerBucket[idx] += 1;
    });

    const activeUsersPerBucket = usersInBucketSet.map((set) => set.size);
    const activeChannelsPerBucket = channelsInBucketSet.map((set) => set.size);

    const discordToken = process.env.DISCORD_TOKEN;

    const userMap = new Map();
    for (const row of msgRows) {
      if (row.deleted || !row.user_id) continue;
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, { userId: row.user_id, username: row.username || row.user_id, count: 0 });
      }
      userMap.get(row.user_id).count += 1;
    }

    let topUsers = [...userMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    const topUserDetails = await Promise.all(topUsers.map((user) => fetchUser(user.userId, guildId, discordToken)));
    topUsers = topUsers.map((user, index) => {
      const payload = topUserDetails[index];
      return {
        ...user,
        username: payload?.global_name || payload?.nick || payload?.username || user.username,
        avatar: resolveAvatarUrl(user.userId, payload, guildId)
      };
    });

    const channelMap = new Map();
    for (const row of msgRows) {
      if (row.deleted || !row.channel_id) continue;
      if (!channelMap.has(row.channel_id)) {
        channelMap.set(row.channel_id, { channelId: row.channel_id, name: row.channel_name || row.channel_id, count: 0 });
      }
      channelMap.get(row.channel_id).count += 1;
    }
    const topChannels = [...channelMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    const vcUserMap = new Map();
    for (const row of vcRows) {
      if (!row.user_id) continue;
      if (!vcUserMap.has(row.user_id)) {
        vcUserMap.set(row.user_id, { userId: row.user_id, username: row.username || row.user_id, minutes: 0 });
      }
      vcUserMap.get(row.user_id).minutes += resolveVcDurationMinutes(row, now);
    }

    let topVcUsers = [...vcUserMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 10);
    const topVcDetails = await Promise.all(topVcUsers.map((user) => fetchUser(user.userId, guildId, discordToken)));
    topVcUsers = topVcUsers.map((user, index) => {
      const payload = topVcDetails[index];
      return {
        ...user,
        username: payload?.global_name || payload?.nick || payload?.username || user.username,
        avatar: resolveAvatarUrl(user.userId, payload, guildId)
      };
    });

    const summaryUsers = new Set();
    const summaryChannels = new Set();
    for (const row of msgRows) {
      if (row.deleted) continue;
      if (row.user_id) summaryUsers.add(row.user_id);
      if (row.channel_id) summaryChannels.add(row.channel_id);
    }
    for (const row of vcRows) {
      if (row.user_id) summaryUsers.add(row.user_id);
    }

    const totalMessages = Number(totalMessagesRes.count || 0);
    const totalDeleted = Number(totalDeletedRes.count || 0);
    const totalVcMinutes = vcRows.reduce((sum, row) => sum + resolveVcDurationMinutes(row, now), 0);
    const latestMessageAt = msgRows.length ? msgRows[msgRows.length - 1].sent_at : null;
    const topUserAvatar = topUsers[0]?.avatar || getDefaultAvatar(topUsers[0]?.userId || '0');

    res.json({
      range,
      meta: {
        generatedAt: now.toISOString(),
        latestMessageAt,
        bucketSizeMinutes: Math.round(bucketSizeMs / 60000),
        bucketCount
      },
      debug: {
        guildIdUsed: guildId,
        recentMessageRows: msgRows.length,
        recentVcRows: vcRows.length,
        recentGrowthRows: growthRows.length,
        totalStoredMessages: totalMessages,
        bucketStart: bucketStart.toISOString(),
        bucketEnd: new Date(bucketStart.getTime() + ((bucketCount - 1) * bucketSizeMs)).toISOString(),
        latestMessageAt
      },
      summary: {
        totalMessages,
        totalDeleted,
        totalVcMinutes: Math.round(totalVcMinutes),
        totalVcHours: Math.round(totalVcMinutes / 60),
        activeChannels: summaryChannels.size,
        activeUsers: summaryUsers.size,
        topUserAvatar
      },
      chart: {
        labels,
        messages: msgPerBucket,
        deleted: deletedPerBucket,
        vcMinutes: vcMinPerBucket.map((value) => Math.round(value)),
        joins: joinsPerBucket,
        leaves: leavesPerBucket,
        activeUsers: activeUsersPerBucket,
        activeChannels: activeChannelsPerBucket
      },
      topUsers,
      topChannels,
      topVcUsers,
      emojis
    });
  } catch (error) {
    console.error('[api/messages]', error?.message);
    res.status(500).json({ error: error?.message || 'Internal error' });
  }
};

