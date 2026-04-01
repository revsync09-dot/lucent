const { createClient } = require('@supabase/supabase-js');
const url = require('url');

let userCache = new Map();

const GAME_META = {
  ALS: { label: 'Anime Last Stand', emojiId: process.env.EMOJI_SERVICE_ALS_ID || process.env.EMOJI_SERVICE_RAIDS_ID || '' },
  AG: { label: 'Anime Guardians', emojiId: process.env.EMOJI_SERVICE_AG_ID || process.env.EMOJI_SERVICE_RACEV4_ID || '' },
  AC: { label: 'Anime Crusaders', emojiId: process.env.EMOJI_SERVICE_AC_ID || process.env.EMOJI_SERVICE_LEVI_ID || '' },
  UTD: { label: 'Universal Tower Defense', emojiId: process.env.EMOJI_SERVICE_UTD_ID || '' },
  AV: { label: 'Anime Vanguards', emojiId: process.env.EMOJI_SERVICE_AV_ID || '' },
  BL: { label: 'Bizarre Lineage', emojiId: process.env.EMOJI_SERVICE_BL_ID || '' },
  SP: { label: 'Sailor Piece', emojiId: process.env.EMOJI_SERVICE_SP_ID || process.env.EMOJI_SERVICE_AP_ID || '' },
  ARX: {
    label: 'Anime Rangers X',
    emojiId:
      process.env.EMOJI_SERVICE_ARX_ID ||
      process.env.EMOJI_SERVICE_ARX ||
      process.env.EMOJI_SERVICE_ANIMERANGERSX_ID ||
      process.env.EMOJI_SERVICE_ANIME_RANGERS_X_ID ||
      ''
  },
  ASTD: { label: 'All Star Tower Defense', emojiId: process.env.EMOJI_SERVICE_ASTD_ID || '' }
};

function buildEmojiUrl(id) {
  return /^\d{17,20}$/.test(String(id || '').trim())
    ? `https://cdn.discordapp.com/emojis/${String(id).trim()}.webp?size=128&quality=lossless`
    : null;
}

function extractFirstItem(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((part) => part.trim())
    .find(Boolean) || '';
}

function normalizeTradeItems(selectedItems, fallbackName, fallbackImage) {
  const normalized = Array.isArray(selectedItems)
    ? selectedItems
      .map((item) => ({
        item_name: String(item?.item_name || item?.name || '').trim(),
        image_url: item?.image_url || null,
        category: item?.category || item?.item_type || null,
        rarity: item?.rarity || null
      }))
      .filter((item) => item.item_name)
    : [];

  if (normalized.length) return normalized.slice(0, 8);
  if (!fallbackName) return [];
  return [{
    item_name: fallbackName,
    image_url: fallbackImage || null,
    category: null,
    rarity: null
  }];
}

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
    // 1. Build Trade Query
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

    const [{ data: trades, count, error }, topTradersRes, allTradesRes] = await Promise.all([
      query,
      supabase.from('vouches')
        .select('helper_user_id')
        .limit(100), // Fetch some rows to aggregate locally or keep it simple
      supabase.from('trade_posts')
        .select('game_key, status')
        .in('status', ['open', 'accepted'])
    ]);

    if (error) throw error;

    if (allTradesRes.error) throw allTradesRes.error;

    // Aggregate top traders locally from the small sample
    const topTradersMap = new Map();
    if (topTradersRes.data) {
        topTradersRes.data.forEach(v => {
            topTradersMap.set(v.helper_user_id, (topTradersMap.get(v.helper_user_id) || 0) + 1);
        });
    }
    const topTraders = [...topTradersMap.entries()]
        .map(([id, total]) => ({ helper_user_id: id, count: total }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 2. Enrichment Logic
    const fetchUserCached = async (id) => {
      const now = Date.now();
      if (userCache.has(id)) {
        const cached = userCache.get(id);
        if (now - cached.time < 600000) return cached.data;
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
      } catch (e) {}
      return null;
    };

    const tradesByGame = {};
    for (const row of allTradesRes.data || []) {
      if (!row.game_key) continue;
      tradesByGame[row.game_key] = (tradesByGame[row.game_key] || 0) + 1;
    }

    const enrichedTrades = await Promise.all((trades || []).map(async (t) => {
      const selectedTrading = Array.isArray(t.settings?.selectedTrading) ? t.settings.selectedTrading : [];
      const selectedLooking = Array.isArray(t.settings?.selectedLooking) ? t.settings.selectedLooking : [];
      const firstTrading = selectedTrading[0]?.item_name || extractFirstItem(t.trading_item);
      const firstLooking = selectedLooking[0]?.item_name || extractFirstItem(t.looking_for);
      const [user, { count: vouchCount }, tradingItemRes, lookingItemRes] = await Promise.all([
        fetchUserCached(t.user_id),
        supabase.from('vouches').select('*', { count: 'exact', head: true }).eq('helper_user_id', t.user_id),
        firstTrading
          ? supabase.from('trade_items').select('item_name,image_url').eq('game_key', t.game_key).ilike('item_name', `%${firstTrading}%`).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        firstLooking
          ? supabase.from('trade_items').select('item_name,image_url').eq('game_key', t.game_key).ilike('item_name', `%${firstLooking}%`).limit(1).maybeSingle()
          : Promise.resolve({ data: null })
      ]);

      const vouches = vouchCount || 0;
      let trustLevel = 'Member';
      if (vouches > 50) trustLevel = 'Elite';
      else if (vouches > 10) trustLevel = 'Trusted';

      return {
        id: t.id,
        userId: t.user_id,
        username: user?.username || `Trader-${t.user_id.substring(0, 5)}`,
        avatar: user?.avatar ? `https://cdn.discordapp.com/avatars/${t.user_id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
        trustScore: trustLevel,
        vouches: vouches,
        gameKey: t.game_key,
        gameLabel: GAME_META[t.game_key]?.label || t.game_key,
        gameEmojiUrl: buildEmojiUrl(GAME_META[t.game_key]?.emojiId),
        trading: t.trading_item,
        lookingFor: t.looking_for,
        tradingImage: selectedTrading[0]?.image_url || tradingItemRes?.data?.image_url || null,
        lookingImage: selectedLooking[0]?.image_url || lookingItemRes?.data?.image_url || null,
        tradingLead: selectedTrading[0]?.item_name || tradingItemRes?.data?.item_name || firstTrading || null,
        lookingLead: selectedLooking[0]?.item_name || lookingItemRes?.data?.item_name || firstLooking || null,
        tradingItems: normalizeTradeItems(selectedTrading, firstTrading, tradingItemRes?.data?.image_url || null),
        lookingItems: normalizeTradeItems(selectedLooking, firstLooking, lookingItemRes?.data?.image_url || null),
        settings: t.settings || {},
        createdAt: t.created_at
      };
    }));

    // 3. Perfect Response
    return res.status(200).json({ 
      success: true, 
      hubName: 'Hyperions Official Trade Hub',
      trades: enrichedTrades,
      gameMeta: Object.fromEntries(
        Object.entries(GAME_META).map(([key, meta]) => [
          key,
          {
            key,
            label: meta.label,
            emojiId: meta.emojiId,
            emojiUrl: buildEmojiUrl(meta.emojiId),
            activeTrades: tradesByGame[key] || 0
          }
        ])
      ),
      stats: {
          activeTrades: count,
          topTraders: topTraders || [],
          protocolStatus: 'SECURE'
      },
      meta: {
          total: count,
          page,
          totalPages: Math.ceil(count / limit)
      }
    });

  } catch (err) {
    console.error('[Trade Hub API Switched] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
