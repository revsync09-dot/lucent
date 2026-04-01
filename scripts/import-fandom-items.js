require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const configPath = path.join(__dirname, '..', 'data', 'fandom-sources.json');
const sourceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[import-fandom-items] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TRADEABLE_ITEM_TYPES = new Set([
  'item',
  'unit',
  'trait',
  'material',
  'portal',
  'relic',
  'fruit',
  'weapon',
  'accessory',
  'consumable'
]);

function inferItemType(categoryName) {
  const loweredCategory = String(categoryName || '').toLowerCase();
  if (loweredCategory.includes('unit')) return 'unit';
  if (loweredCategory.includes('trait')) return 'trait';
  if (loweredCategory.includes('material')) return 'material';
  if (loweredCategory.includes('portal')) return 'portal';
  if (loweredCategory.includes('relic')) return 'relic';
  if (loweredCategory.includes('fruit')) return 'fruit';
  if (loweredCategory.includes('weapon')) return 'weapon';
  if (loweredCategory.includes('accessor')) return 'accessory';
  if (loweredCategory.includes('consumable')) return 'consumable';
  if (loweredCategory.includes('item')) return 'item';
  return null;
}

function isTradeableCategory(categoryName) {
  return TRADEABLE_ITEM_TYPES.has(inferItemType(categoryName));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'HyperionsBot/3.4.0 (fandom item importer)'
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} for ${url} ${text}`.trim());
  }
  return response.json();
}

async function getCategoryMembers(wiki, categoryTitle) {
  const pages = [];
  let continueToken = null;
  do {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'categorymembers',
      cmtitle: categoryTitle.startsWith('Category:') ? categoryTitle : `Category:${categoryTitle}`,
      cmlimit: '500',
      cmtype: 'page'
    });
    if (continueToken) params.set('cmcontinue', continueToken);
    const data = await fetchJson(`${wiki}/api.php?${params.toString()}`);
    pages.push(...(data?.query?.categorymembers || []));
    continueToken = data?.continue?.cmcontinue || null;
  } while (continueToken);
  return pages;
}

async function getAllPages(wiki) {
  const pages = [];
  let continueToken = null;
  do {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'allpages',
      apnamespace: '0',
      aplimit: '500'
    });
    if (continueToken) params.set('apcontinue', continueToken);
    const data = await fetchJson(`${wiki}/api.php?${params.toString()}`);
    pages.push(...(data?.query?.allpages || []));
    continueToken = data?.continue?.apcontinue || null;
  } while (continueToken);
  return pages;
}

async function getPageDetails(wiki, titles) {
  if (!titles.length) return [];
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    prop: 'pageimages|extracts',
    exintro: '1',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '600',
    titles: titles.join('|')
  });
  const data = await fetchJson(`${wiki}/api.php?${params.toString()}`);
  return Object.values(data?.query?.pages || {});
}

async function getWordPressPage(baseUrl, slug) {
  const apiUrl = `${String(baseUrl).replace(/\/$/, '')}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`;
  const data = await fetchJson(apiUrl);
  return Array.isArray(data) ? data[0] : null;
}

async function getFandomParsedPage(baseUrl, pageName) {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    page: pageName,
    prop: 'text'
  });
  const data = await fetchJson(`${String(baseUrl).replace(/\/$/, '')}/api.php?${params.toString()}`);
  return data?.parse?.text?.['*'] || '';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttribute(fragment, attribute) {
  const match = fragment.match(new RegExp(`${attribute}="([^"]+)"`, 'i'));
  return match ? decodeHtml(match[1]) : null;
}

function buildExternalItemRow(gameKey, sourceUrl, categoryName, itemType, item) {
  const title = stripHtml(item.item_name || item.title || item.name || 'Unknown');
  if (!title) return null;
  return {
    game_key: gameKey,
    item_name: title,
    slug: slugify(title),
    wiki_title: title,
    wiki_url: item.url || sourceUrl,
    image_url: item.image_url || null,
    category: categoryName,
    rarity: item.rarity || null,
    item_type: itemType,
    description: item.description || null,
    source: 'external-catalog',
    raw: {
      source_url: sourceUrl
    },
    updated_at: new Date().toISOString()
  };
}

function parseWordPressItemsTabs(gameKey, renderedHtml, sourceUrl) {
  const tabMatches = [...String(renderedHtml || '').matchAll(/<strong>([^<]+)<\/strong>/gi)].map((match) => stripHtml(match[1]));
  const tables = [...String(renderedHtml || '').matchAll(/<table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/table>/gi)];
  const rows = [];

  tables.forEach((tableMatch, index) => {
    const categoryName = tabMatches[index] || 'Items';
    const itemType = inferItemType(categoryName) || 'item';
    if (!TRADEABLE_ITEM_TYPES.has(itemType)) return;
    const body = tableMatch[1];
    const rowMatches = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
    for (const rowMatch of rowMatches) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
      if (!cells.length) continue;
      const name = stripHtml(cells[0]);
      if (!name) continue;
      const imageUrl = extractAttribute(cells[1] || '', 'src');
      const rarity = stripHtml(cells[2] || '');
      const description = stripHtml(cells[cells.length - 1] || '');
      const built = buildExternalItemRow(gameKey, sourceUrl, categoryName, itemType, {
        item_name: name,
        image_url: imageUrl,
        rarity,
        description
      });
      if (built) rows.push(built);
    }
  });

  return rows;
}

function parseWordPressUnitsGrid(gameKey, renderedHtml, sourceUrl) {
  const rows = [];
  const cardMatches = [...String(renderedHtml || '').matchAll(/<figure class="wp-block-image[\s\S]*?(<img[\s\S]*?>)[\s\S]*?<\/figure>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const match of cardMatches) {
    const imageFragment = match[1];
    const textFragment = match[2];
    const title = stripHtml(textFragment);
    if (!title) continue;
    const imageUrl = extractAttribute(imageFragment, 'src');
    const href = extractAttribute(textFragment, 'href');
    const built = buildExternalItemRow(gameKey, sourceUrl, 'Units', 'unit', {
      item_name: title,
      image_url: imageUrl,
      url: href || sourceUrl
    });
    if (built) rows.push(built);
  }
  return rows;
}

function parseFandomTableRows(gameKey, renderedHtml, sourceUrl, fallbackItemType) {
  const rows = [];
  const tableMatches = [...String(renderedHtml || '').matchAll(/<table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/table>/gi)];
  for (const tableMatch of tableMatches) {
    const body = tableMatch[1];
    const rowMatches = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
    for (const rowMatch of rowMatches) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
      if (cells.length < 2) continue;
      const name = stripHtml(cells[0]);
      if (!name || /^(item|name)$/i.test(name)) continue;
      const imageUrl = extractAttribute(cells[0], 'data-src') || extractAttribute(cells[0], 'src') || extractAttribute(cells[1] || '', 'data-src') || extractAttribute(cells[1] || '', 'src');
      const rarity = stripHtml(cells[2] || '');
      const description = stripHtml(cells[cells.length - 1] || '');
      const built = buildExternalItemRow(gameKey, sourceUrl, fallbackItemType === 'unit' ? 'Units' : 'Items', fallbackItemType, {
        item_name: name,
        image_url: imageUrl,
        rarity,
        description
      });
      if (built) rows.push(built);
    }
  }
  return rows;
}

function parseFandomCardBoxes(gameKey, renderedHtml, sourceUrl, fallbackItemType) {
  const rows = [];
  const boxMatches = [...String(renderedHtml || '').matchAll(/<div class="advanced-tooltip[\s\S]*?<div class="ChBox_Title[^"]*">([\s\S]*?)<\/div>[\s\S]*?<div class="tooltip-contents"[\s\S]*?<\/div>\s*<\/div>/gi)];
  for (const boxMatch of boxMatches) {
    const block = boxMatch[0];
    const title = stripHtml(boxMatch[1]);
    if (!title) continue;
    const imageUrl = extractAttribute(block, 'data-src') || extractAttribute(block, 'src');
    const typeMatch = block.match(/Type:<\/span>\s*<span>([^<]+)<\/span>/i);
    const rarityMatch = block.match(/Rarity-text-top">([^<]+)</i);
    const descriptionMatch = block.match(/Description:<\/span>\s*<span>([\s\S]*?)<\/span>/i);
    const typeValue = stripHtml(typeMatch ? typeMatch[1] : '');
    const inferredType = inferItemType(typeValue) || fallbackItemType;
    if (!TRADEABLE_ITEM_TYPES.has(String(inferredType || '').toLowerCase())) continue;
    const built = buildExternalItemRow(gameKey, sourceUrl, typeValue || (fallbackItemType === 'unit' ? 'Units' : 'Items'), inferredType, {
      item_name: title,
      image_url: imageUrl,
      rarity: stripHtml(rarityMatch ? rarityMatch[1] : ''),
      description: stripHtml(descriptionMatch ? descriptionMatch[1] : '')
    });
    if (built) rows.push(built);
  }
  return rows;
}

async function importExtraSource(gameKey, source) {
  if (source.type === 'fandom-parse-page') {
    const renderedHtml = await getFandomParsedPage(source.baseUrl, source.page);
    const fandomUrl = `${String(source.baseUrl).replace(/\/$/, '')}/wiki/${encodeURIComponent(String(source.page).replace(/ /g, '_'))}`;
    const rows = [
      ...parseFandomTableRows(gameKey, renderedHtml, fandomUrl, source.itemType || 'item'),
      ...parseFandomCardBoxes(gameKey, renderedHtml, fandomUrl, source.itemType || 'item')
    ];
    return rows;
  }
  const page = await getWordPressPage(source.baseUrl, source.slug);
  if (!page?.content?.rendered) return [];
  const sourceUrl = page.link || `${String(source.baseUrl).replace(/\/$/, '')}/${source.slug}`;
  if (source.type === 'wordpress-items-tabs') {
    return parseWordPressItemsTabs(gameKey, page.content.rendered, sourceUrl);
  }
  if (source.type === 'wordpress-units-grid') {
    return parseWordPressUnitsGrid(gameKey, page.content.rendered, sourceUrl);
  }
  return [];
}

function buildItemRow(gameKey, wiki, category, page) {
  const title = page.title || 'Unknown';
  const categoryName = category.replace(/^Category:/i, '');
  const itemType = inferItemType(categoryName);
  return {
    game_key: gameKey,
    item_name: title,
    slug: slugify(title),
    wiki_title: title,
    wiki_url: `${wiki}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    image_url: page.thumbnail?.source || null,
    category: categoryName,
    rarity: null,
    item_type: itemType,
    description: page.extract || null,
    source: 'fandom',
    raw: {
      pageid: page.pageid,
      thumbnail: page.thumbnail || null,
      length: page.length || null
    },
    updated_at: new Date().toISOString()
  };
}

async function importGame(gameKey) {
  const source = sourceConfig[gameKey];
  if (!source) throw new Error(`No fandom source config for ${gameKey}`);

  const rows = [];
  const seen = new Set();
  let usedFallbackCategories = false;

  if (source.mode === 'all-pages') {
    try {
      console.log(`[import-fandom-items] ${gameKey}: loading all main wiki pages`);
      const pages = await getAllPages(source.wiki);
      const titles = pages
        .map((page) => page.title)
        .filter((title) => title && !seen.has(title));

      for (const title of titles) seen.add(title);

      for (let i = 0; i < titles.length; i += 25) {
        const chunk = titles.slice(i, i + 25);
        const details = await getPageDetails(source.wiki, chunk);
        for (const page of details) {
          if (!page?.title || Number(page?.ns) !== 0 || page?.missing != null) continue;
          rows.push(buildItemRow(gameKey, source.wiki, 'All Pages', page));
        }
      }
    } catch (error) {
      console.warn(`[import-fandom-items] ${gameKey}: all-pages failed, switching to categories (${error.message})`);
      usedFallbackCategories = true;
      seen.clear();
      rows.length = 0;
    }
  }

  for (const category of ((source.mode === 'all-pages' && !usedFallbackCategories) ? [] : (source.categories || []))) {
    if (!isTradeableCategory(category)) continue;
    console.log(`[import-fandom-items] ${gameKey}: loading ${category}`);
    try {
      const members = await getCategoryMembers(source.wiki, category);
      const titles = members
        .map((item) => item.title)
        .filter((title) => title && !seen.has(title));

      for (const title of titles) seen.add(title);

      for (let i = 0; i < titles.length; i += 25) {
        const chunk = titles.slice(i, i + 25);
        const details = await getPageDetails(source.wiki, chunk);
        for (const page of details) {
          if (!page?.title || Number(page?.ns) !== 0 || page?.missing != null) continue;
          rows.push(buildItemRow(gameKey, source.wiki, category, page));
        }
      }
    } catch (error) {
      console.warn(`[import-fandom-items] ${gameKey}: category ${category} failed (${error.message})`);
    }
  }

  for (const extraSource of (source.extraSources || [])) {
    console.log(`[import-fandom-items] ${gameKey}: loading external source ${extraSource.type}:${extraSource.page || extraSource.slug || extraSource.baseUrl}`);
    try {
      const importedRows = await importExtraSource(gameKey, extraSource);
      rows.push(...importedRows);
    } catch (error) {
      console.warn(`[import-fandom-items] ${gameKey}: external source ${extraSource.type}:${extraSource.page || extraSource.slug || extraSource.baseUrl} failed (${error.message})`);
    }
  }

  const deduped = Array.from(new Map(
    rows
      .filter((row) => TRADEABLE_ITEM_TYPES.has(String(row.item_type || '').toLowerCase()))
      .map((row) => [`${row.game_key}:${row.slug}`, row])
  ).values());
  console.log(`[import-fandom-items] ${gameKey}: upserting ${deduped.length} items`);

  const { error: deleteError } = await supabase
    .from('trade_items')
    .delete()
    .eq('game_key', gameKey);
  if (deleteError) throw deleteError;

  for (let i = 0; i < deduped.length; i += 250) {
    const chunk = deduped.slice(i, i + 250);
    const { error } = await supabase
      .from('trade_items')
      .upsert(chunk, { onConflict: 'game_key,slug' });
    if (error) throw error;
  }

  console.log(`[import-fandom-items] ${gameKey}: done`);
}

async function main() {
  const args = parseArgs(process.argv);
  const games = String(args.game || args.games || 'ALL')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const targetGames = games.includes('ALL') ? Object.keys(sourceConfig) : games;
  const failures = [];
  for (const gameKey of targetGames) {
    try {
      await importGame(gameKey);
    } catch (error) {
      failures.push({ gameKey, error: error.message });
      console.error(`[import-fandom-items] ${gameKey} failed: ${error.message}`);
    }
  }

  if (failures.length) {
    console.error('[import-fandom-items] Completed with failures:');
    for (const failure of failures) {
      console.error(`- ${failure.gameKey}: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[import-fandom-items] Failed:', error.message);
  process.exit(1);
});
