import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 5000;
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
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers });
        if (res.ok) {
            const member = await res.json();
            if (member?.user) {
                payload = { ...member.user, guild_avatar: member.avatar, nick: member.nick || null };
            }
        }
    } catch (e) {}

    if (!payload) {
        try {
            const res = await fetch(`https://discord.com/api/v10/users/${userId}`, { headers });
            if (res.ok) payload = await res.json();
        } catch (e) {}
    }

    if (payload) userCache.set(userId, payload);
    return payload;
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

export async function onRequest(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), { status: 500, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const guildId = url.searchParams.get('guildId') || env.DISCORD_GUILD_ID || '1422969507734884374';
    const discordToken = env.DISCORD_TOKEN;

    const emojis = {
        messages: normalizeEmojiValue(env.EMOJI_MESSAGES || '💬'),
        deleted: normalizeEmojiValue(env.EMOJI_DELETED || '🗑️'),
        vc: normalizeEmojiValue(env.EMOJI_VC || '🔊'),
        channels: normalizeEmojiValue(env.EMOJI_CHANNELS || '#'),
        users: normalizeEmojiValue(env.EMOJI_USERS || '👥'),
        chart: normalizeEmojiValue(env.EMOJI_CHART || '📈'),
        wave: normalizeEmojiValue(env.EMOJI_WAVE || '🌊'),
        activity: normalizeEmojiValue(env.EMOJI_ACTIVITY || '📊'),
        growth: normalizeEmojiValue(env.EMOJI_GROWTH || '📈'),
        joins: normalizeEmojiValue(env.EMOJI_JOINS || '📈'),
        leaves: normalizeEmojiValue(env.EMOJI_LEAVES || '📉'),
        text: normalizeEmojiValue(env.EMOJI_TEXT || '💬'),
        boardUsers: normalizeEmojiValue(env.EMOJI_BOARD_USERS || '👤'),
        boardChannels: normalizeEmojiValue(env.EMOJI_BOARD_CHANNELS || '#'),
        boardVc: normalizeEmojiValue(env.EMOJI_BOARD_VC || '🎙️')
    };

    try {
        const range = url.searchParams.get('range') || '30d';
        const now = new Date();
        const tzOffsetMinutes = Number(url.searchParams.get('tzOffsetMinutes')) || 0;
        const tzOffsetMs = tzOffsetMinutes * 60000;

        let daysBack = 30;
        if (range === '7d') daysBack = 7;
        else if (range === '24h') daysBack = 1;
        else if (range === 'all') daysBack = 365;

        let bucketCount = daysBack === 1 ? 48 : daysBack;
        let bucketUnit = daysBack === 1 ? 'halfHour' : 'day';
        let bucketSizeMs = bucketUnit === 'halfHour' ? HALF_HOUR_MS : DAY_MS;
        let endBucketStart = bucketUnit === 'halfHour' ? startOfUtcHalfHour(now) : startOfUtcDay(now);
        let bucketStart = new Date(endBucketStart.getTime() - ((bucketCount - 1) * bucketSizeMs));

        if (range === '24h') {
            const shiftedNow = new Date(now.getTime() - tzOffsetMs);
            let localStartMs = Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate(), 8, 0, 0, 0);
            if (shiftedNow.getUTCHours() < 8) localStartMs -= DAY_MS;
            const localEndBucketMs = startOfUtcHalfHour(shiftedNow).getTime();
            bucketCount = Math.max(1, Math.floor((localEndBucketMs - localStartMs) / HALF_HOUR_MS) + 1);
            bucketUnit = 'halfHour';
            bucketSizeMs = HALF_HOUR_MS;
            endBucketStart = new Date(localEndBucketMs + tzOffsetMs);
            bucketStart = new Date(localStartMs + tzOffsetMs);
        }

        const sinceIso = bucketStart.toISOString();

        const [msgRows, vcRows, growthRows, totalMessagesRes, totalDeletedRes] = await Promise.all([
            fetchAllRows(supabase, 'server_messages', 'sent_at, channel_id, channel_name, user_id, username, deleted', (q) => q.gte('sent_at', sinceIso).eq('guild_id', guildId).order('sent_at', { ascending: true })),
            fetchAllRows(supabase, 'vc_sessions', 'user_id, username, joined_at, left_at, duration_minutes', (q) => q.gte('joined_at', sinceIso).eq('guild_id', guildId).order('joined_at', { ascending: true })),
            fetchAllRows(supabase, 'guild_growth', 'event_type, created_at', (q) => q.gte('created_at', sinceIso).eq('guild_id', guildId).order('created_at', { ascending: true })),
            supabase.from('server_messages').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).eq('deleted', false),
            supabase.from('server_messages').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).eq('deleted', true)
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

        for (const row of msgRows) {
            const dt = new Date(row.sent_at);
            const idx = Math.floor((dt.getTime() - bucketStart.getTime()) / bucketSizeMs);
            if (idx >= 0 && idx < bucketCount) {
                if (row.deleted) deletedPerBucket[idx]++;
                else {
                    msgPerBucket[idx]++;
                    if (row.user_id) usersInBucketSet[idx].add(row.user_id);
                    if (row.channel_id) channelsInBucketSet[idx].add(row.channel_id);
                }
            }
        }

        for (const row of vcRows) {
            distributeVcSession(row, now, bucketStart, bucketSizeMs, bucketCount, vcMinPerBucket, usersInBucketSet);
        }

        for (const row of growthRows) {
            const dt = new Date(row.created_at);
            const idx = Math.floor((dt.getTime() - bucketStart.getTime()) / bucketSizeMs);
            if (idx >= 0 && idx < bucketCount) {
                if (row.event_type === 'join') joinsPerBucket[idx]++;
                else if (row.event_type === 'leave') leavesPerBucket[idx]++;
            }
        }

        const activeUsersPerBucket = usersInBucketSet.map(s => s.size);
        const activeChannelsPerBucket = channelsInBucketSet.map(s => s.size);

        const userMap = new Map();
        for (const row of msgRows) {
            if (row.deleted || !row.user_id) continue;
            if (!userMap.has(row.user_id)) userMap.set(row.user_id, { userId: row.user_id, username: row.username || row.user_id, count: 0 });
            userMap.get(row.user_id).count++;
        }

        let topUsers = [...userMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);
        const topUserDetails = await Promise.all(topUsers.map(u => fetchUser(u.userId, guildId, discordToken)));
        topUsers = topUsers.map((u, i) => {
            const p = topUserDetails[i];
            return { ...u, username: p?.global_name || p?.nick || p?.username || u.username, avatar: resolveAvatarUrl(u.userId, p, guildId) };
        });

        const channelMap = new Map();
        for (const row of msgRows) {
            if (row.deleted || !row.channel_id) continue;
            if (!channelMap.has(row.channel_id)) channelMap.set(row.channel_id, { channelId: row.channel_id, name: row.channel_name || row.channel_id, count: 0 });
            channelMap.get(row.channel_id).count++;
        }
        const topChannels = [...channelMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

        const vcUserMap = new Map();
        for (const row of vcRows) {
            if (!row.user_id) continue;
            if (!vcUserMap.has(row.user_id)) vcUserMap.set(row.user_id, { userId: row.user_id, username: row.username || row.user_id, minutes: 0 });
            vcUserMap.get(row.user_id).minutes += resolveVcDurationMinutes(row, now);
        }

        let topVcUsers = [...vcUserMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 10);
        const topVcDetails = await Promise.all(topVcUsers.map(u => fetchUser(u.userId, guildId, discordToken)));
        topVcUsers = topVcUsers.map((u, i) => {
            const p = topVcDetails[i];
            return { ...u, username: p?.global_name || p?.nick || p?.username || u.username, avatar: resolveAvatarUrl(u.userId, p, guildId) };
        });

        const summaryUsers = new Set();
        const summaryChannels = new Set();
        for (const row of msgRows) {
            if (!row.deleted) {
                if (row.user_id) summaryUsers.add(row.user_id);
                if (row.channel_id) summaryChannels.add(row.channel_id);
            }
        }
        for (const row of vcRows) {
            if (row.user_id) summaryUsers.add(row.user_id);
        }

        const totalMessages = Number(totalMessagesRes.count || 0);
        const totalDeleted = Number(totalDeletedRes.count || 0);
        const totalVcMinutes = vcRows.reduce((s, r) => s + resolveVcDurationMinutes(r, now), 0);
        const topUserAvatar = topUsers[0]?.avatar || getDefaultAvatar(topUsers[0]?.userId || '0');

        return new Response(JSON.stringify({
            range,
            meta: {
                generatedAt: now.toISOString(),
                latestMessageAt: msgRows.length ? msgRows[msgRows.length - 1].sent_at : null,
                bucketSizeMinutes: Math.round(bucketSizeMs / 60000),
                bucketCount
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
            chart: { labels, messages: msgPerBucket, deleted: deletedPerBucket, vcMinutes: vcMinPerBucket.map(v => Math.round(v)), joins: joinsPerBucket, leaves: leavesPerBucket, activeUsers: activeUsersPerBucket, activeChannels: activeChannelsPerBucket },
            topUsers,
            topChannels,
            topVcUsers,
            emojis
        }), { headers });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}
