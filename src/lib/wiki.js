
const GAME_WIKIS = {
  'ALS': 'https://alsroblox.fandom.com',
  'AG': 'https://animeguardians.fandom.com',
  'AC': 'https://animecrusaders.fandom.com',
  'UTD': 'https://universaltd.fandom.com',
  'AV': 'https://animevanguards.fandom.com',
  'BL': 'https://bizarrelineage.fandom.com',
  'SP': 'https://sailor-piece.fandom.com',
  'ARX': 'https://animerangersx.fandom.com',
  'ASTD': 'https://allstartd.fandom.com'
};

async function getWikiImageData(gameKey, itemName) {
  const baseUrl = GAME_WIKIS[gameKey.toUpperCase()];
  if (!baseUrl) return null;

  try {
    const searchUrl = `${baseUrl}/api.php?action=query&list=search&srsearch=${encodeURIComponent(itemName)}&format=json`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const searchResult = searchData.query.search?.[0];

    if (!searchResult) return null;

    const pageTitle = searchResult.title;
    const imgUrl = `${baseUrl}/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&format=json&pithumbsize=500`;
    const imgRes = await fetch(imgUrl);
    const imgData = await imgRes.json();
    
    const pages = imgData.query.pages;
    const pageId = Object.keys(pages)[0];
    const thumbnail = pages[pageId].thumbnail?.source;

    return thumbnail || null;
  } catch (err) {
    console.error(`[wiki] Failed to fetch image for ${itemName} in ${gameKey}:`, err.message);
    return null;
  }
}

module.exports = { getWikiImageData };
