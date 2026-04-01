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

function buildEmojiUrl(id) {
  return /^\d{17,20}$/.test(String(id || '').trim())
    ? `https://cdn.discordapp.com/emojis/${String(id).trim()}.webp?size=128&quality=lossless`
    : null;
}

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

const TRADEABLE_ITEM_TYPES = new Set(['item', 'unit', 'trait', 'material', 'portal', 'relic', 'fruit', 'weapon', 'accessory', 'consumable']);

function isTradeableItem(row) {
  const itemType = String(row?.item_type || '').toLowerCase();
  const category = String(row?.category || '').toLowerCase();
  if (TRADEABLE_ITEM_TYPES.has(itemType)) return true;
  return ['item', 'unit', 'trait', 'material', 'portal', 'relic', 'fruit', 'weapon', 'accessor', 'consumable']
    .some((token) => category.includes(token));
}

export async function onRequest(context) {
  const { request, env } = context;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ success: false, error: 'Supabase credentials missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(request.url);
  const gameFilter = url.searchParams.get('game');
  const search = url.searchParams.get('search');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 24, 500);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
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
      supabase.from('trade_items').select('game_key, category, item_type').order('game_key', { ascending: true }),
      supabase.from('trade_items').select('game_key, category, item_type')
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

    return json({
      success: true,
      items: filteredItems,
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
              itemCount: countsByGame[key] || 0
            }
          ];
        })
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
    console.error('[functions/api/items] failed', error);
    return json({ success: false, error: error.message }, 500);
  }
}
