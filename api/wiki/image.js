const { getWikiImageData } = require('../../src/lib/wiki');

module.exports = async (req, res) => {
  const { game, item } = req.query;

  if (!game || !item) {
    return res.status(400).json({ error: 'Missing game or item' });
  }

  try {
    const imageUrl = await getWikiImageData(game, item);
    return res.status(200).json({ success: true, imageUrl });
  } catch (err) {
    console.error('[api/wiki/image] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
