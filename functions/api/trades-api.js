import { createClient } from '@supabase/supabase-js';

const GAME_META = {
  ALS: { label: 'Anime Last Stand', emojiIdKey: 'EMOJI_SERVICE_ALS_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_RAIDS_ID' },
  AG: { label: 'Anime Guardians', emojiIdKey: 'EMOJI_SERVICE_AG_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_RACEV4_ID' },
  AC: { label: 'Anime Crusaders', emojiIdKey: 'EMOJI_SERVICE_AC_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_LEVI_ID' },
  UTD: { label: 'Universal Tower Defense', emojiIdKey: 'EMOJI_SERVICE_UTD_ID' },
  AV: { label: 'Anime Vanguards', emojiIdKey: 'EMOJI_SERVICE_AV_ID' },
  BL: { label: 'Bizarre Lineage', emojiIdKey: 'EMOJI_SERVICE_BL_ID' },
  SP: { label: 'Sailor Piece', emojiIdKey: 'EMOJI_SERVICE_SP_ID', fallbackEmojiIdKey: 'EMOJI_SERVICE_AP_ID' },
  ARX: {
    label: 'Anime Rangers X',
    emojiIdKey: 'EMOJI_SERVICE_ARX_ID',
    fallbackEmojiIdKey: 'EMOJI_SERVICE_ARX'
  },
  ASTD: { label: 'All Star Tower Defense', emojiIdKey: 'EMOJI_SERVICE_ASTD_ID' }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Type': 'application/json'
    }
  });
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

function buildEmojiUrl(id) {
  return /^\d{17,20}$/.test(String(id || '').trim())
    ? `https://cdn.discordapp.com/emojis/${String(id).trim()}.webp?size=128&quality=lossless`
    : null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = env.DISCORD_TOKEN;

  if (!supabaseUrl || !supabaseKey) {
    return json({ success: false, error: 'Supabase credentials missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(request.url);
  const gameFilter = url.searchParams.get('game');
  const searchQuery = url.searchParams.get('search');
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  try {
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
      supabase.from('vouches').select('helper_user_id').limit(100),
      supabase.from('trade_posts').select('game_key, status').in('status', ['open', 'accepted'])
    ]);

    if (error) throw error;
    if (topTradersRes.error) throw topTradersRes.error;
    if (allTradesRes.error) throw allTradesRes.error;

    const topTradersMap = new Map();
    for (const row of topTradersRes.data || []) {
      topTradersMap.set(row.helper_user_id, (topTradersMap.get(row.helper_user_id) || 0) + 1);
    }
    const topTraders = [...topTradersMap.entries()]
      .map(([id, total]) => ({ helper_user_id: id, count: total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const tradesByGame = {};
    for (const row of allTradesRes.data || []) {
      if (!row.game_key) continue;
      tradesByGame[row.game_key] = (tradesByGame[row.game_key] || 0) + 1;
    }

    const fetchUserCached = async (id) => {
      if (!discordToken) return null;
      try {
        const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
          headers: { Authorization: `Bot ${discordToken}` }
        });
        if (res.ok) return await res.json();
      } catch (_) {}
      return null;
    };

    const enrichedTrades = await Promise.all((trades || []).map(async (trade) => {
      const selectedTrading = Array.isArray(trade.settings?.selectedTrading) ? trade.settings.selectedTrading : [];
      const selectedLooking = Array.isArray(trade.settings?.selectedLooking) ? trade.settings.selectedLooking : [];
      const firstTrading = selectedTrading[0]?.item_name || extractFirstItem(trade.trading_item);
      const firstLooking = selectedLooking[0]?.item_name || extractFirstItem(trade.looking_for);

      const [user, vouchCountRes, tradingItemRes, lookingItemRes] = await Promise.all([
        fetchUserCached(trade.user_id),
        supabase.from('vouches').select('*', { count: 'exact', head: true }).eq('helper_user_id', trade.user_id),
        firstTrading
          ? supabase.from('trade_items').select('item_name,image_url').eq('game_key', trade.game_key).ilike('item_name', `%${firstTrading}%`).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        firstLooking
          ? supabase.from('trade_items').select('item_name,image_url').eq('game_key', trade.game_key).ilike('item_name', `%${firstLooking}%`).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      const vouches = vouchCountRes.count || 0;
      let trustLevel = 'Member';
      if (vouches > 50) trustLevel = 'Elite';
      else if (vouches > 10) trustLevel = 'Trusted';

      const emojiId = env[GAME_META[trade.game_key]?.emojiIdKey] ||
        (GAME_META[trade.game_key]?.fallbackEmojiIdKey ? env[GAME_META[trade.game_key].fallbackEmojiIdKey] : '') ||
        '';

      return {
        id: trade.id,
        userId: trade.user_id,
        username: user?.username || `Trader-${trade.user_id.substring(0, 5)}`,
        avatar: user?.avatar
          ? `https://cdn.discordapp.com/avatars/${trade.user_id}/${user.avatar}.png?size=128`
          : 'https://cdn.discordapp.com/embed/avatars/0.png',
        trustScore: trustLevel,
        vouches,
        gameKey: trade.game_key,
        gameLabel: GAME_META[trade.game_key]?.label || trade.game_key,
        gameEmojiUrl: buildEmojiUrl(emojiId),
        trading: trade.trading_item,
        lookingFor: trade.looking_for,
        tradingImage: selectedTrading[0]?.image_url || tradingItemRes.data?.image_url || null,
        lookingImage: selectedLooking[0]?.image_url || lookingItemRes.data?.image_url || null,
        tradingLead: selectedTrading[0]?.item_name || tradingItemRes.data?.item_name || firstTrading || null,
        lookingLead: selectedLooking[0]?.item_name || lookingItemRes.data?.item_name || firstLooking || null,
        tradingItems: normalizeTradeItems(selectedTrading, firstTrading, tradingItemRes.data?.image_url || null),
        lookingItems: normalizeTradeItems(selectedLooking, firstLooking, lookingItemRes.data?.image_url || null),
        settings: trade.settings || {},
        createdAt: trade.created_at,
        isVerified: true
      };
    }));

    return json({
      success: true,
      hubName: 'Hyperions Official Trade Hub',
      trades: enrichedTrades,
      gameMeta: Object.fromEntries(
        Object.entries(GAME_META).map(([key, meta]) => {
          const emojiId = env[meta.emojiIdKey] || (meta.fallbackEmojiIdKey ? env[meta.fallbackEmojiIdKey] : '') || '';
          return [
            key,
            {
              key,
              label: meta.label,
              emojiId,
              emojiUrl: buildEmojiUrl(emojiId),
              activeTrades: tradesByGame[key] || 0
            }
          ];
        })
      ),
      stats: {
        activeTrades: count || 0,
        topTraders,
        protocolStatus: 'SECURE'
      },
      meta: {
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit) || 1
      }
    });
  } catch (error) {
    console.error('[functions/api/trades-api] failed', error);
    return json({ success: false, error: error.message }, 500);
  }
}
