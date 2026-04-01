const { createClient } = require('@supabase/supabase-js');
const url = require('url');

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

const TRADEABLE_ITEM_TYPES = new Set(['item', 'unit', 'trait', 'material', 'portal', 'relic', 'fruit', 'weapon', 'accessory', 'consumable']);

function isTradeableItem(row) {
  const itemType = String(row?.item_type || '').toLowerCase();
  const category = String(row?.category || '').toLowerCase();
  if (TRADEABLE_ITEM_TYPES.has(itemType)) return true;
  return ['item', 'unit', 'trait', 'material', 'portal', 'relic', 'fruit', 'weapon', 'accessor', 'consumable']
    .some((token) => category.includes(token));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Supabase credentials missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const queryObject = url.parse(req.url, true).query;

  const gameFilter = queryObject.game || null;
  const search = queryObject.search || null;
  const limit = Math.min(Number(queryObject.limit) || 24, 500);
  const page = Math.max(Number(queryObject.page) || 1, 1);
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('trade_items')
      .select('id, game_key, item_name, slug, wiki_title, wiki_url, image_url, category, rarity, item_type, description, updated_at', { count: 'exact' })
      .order('item_name', { ascending: true });

    if (gameFilter) {
      query = query.eq('game_key', gameFilter.toUpperCase());
    }

    if (search) {
      query = query.or([
        `item_name.ilike.%${search}%`,
        `category.ilike.%${search}%`,
        `description.ilike.%${search}%`
      ].join(','));
    }

    query = query.range(offset, offset + limit - 1);

    const [itemsRes, categoriesRes, countsRes] = await Promise.all([
      query,
      supabase
        .from('trade_items')
        .select('game_key, category, item_type')
        .order('game_key', { ascending: true }),
      supabase
        .from('trade_items')
        .select('game_key, category, item_type')
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (categoriesRes.error) throw categoriesRes.error;
    if (countsRes.error) throw countsRes.error;

    const categoryMap = new Map();
    for (const row of (categoriesRes.data || []).filter(isTradeableItem)) {
      const gameKey = row.game_key || 'UNKNOWN';
      if (!categoryMap.has(gameKey)) categoryMap.set(gameKey, new Set());
      if (row.category) categoryMap.get(gameKey).add(row.category);
    }

    const countsByGame = {};
    for (const row of (countsRes.data || []).filter(isTradeableItem)) {
      const gameKey = row.game_key || 'UNKNOWN';
      countsByGame[gameKey] = (countsByGame[gameKey] || 0) + 1;
    }

    const filteredItems = (itemsRes.data || []).filter(isTradeableItem);
    const totalTradeable = Object.values(countsByGame).reduce((sum, value) => sum + value, 0);

    return res.status(200).json({
      success: true,
      items: filteredItems,
      gameMeta: Object.fromEntries(
        Object.entries(GAME_META).map(([key, meta]) => [
          key,
          {
            key,
            label: meta.label,
            emojiId: meta.emojiId,
            emojiUrl: buildEmojiUrl(meta.emojiId),
            itemCount: countsByGame[key] || 0
          }
        ])
      ),
      categories: Object.fromEntries(
        Array.from(categoryMap.entries()).map(([gameKey, value]) => [gameKey, Array.from(value).sort()])
      ),
      meta: {
        total: totalTradeable || filteredItems.length,
        page,
        totalPages: Math.max(1, Math.ceil((totalTradeable || filteredItems.length || 0) / limit)),
        limit
      }
    });
  } catch (error) {
    console.error('[items api] failed', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
