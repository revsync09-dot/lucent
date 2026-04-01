require('dotenv').config();
const { buildVouchCard } = require('./src/lib/vouch-card');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Generating test vouch card...');
  const result = await buildVouchCard({
    helperTag: 'Hyperion_Pro',
    helperId: '981642103358636065',
    helperAvatarUrl: 'https://cdn.discordapp.com/avatars/981642103358636065/e31558f95413c4e15749b1914d7ef973.png',
    clientTag: 'TestUser#1234',
    clientAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    rating: 5,
    message: 'Absolutely incredible helper! Carried me through the hardest content with ease. Would 100% recommend to anyone looking for a skilled and friendly helper. Best experience ever!',
    gameKey: 'ALS',
    gameLabel: 'Anime Last Stand',
    stats: {
      total: 158,
      average: 4.9,
      fiveStarRate: 94,
      topGame: 'ALS'
    }
  });
  const outPath = path.join(__dirname, 'test-vouch-output.png');
  fs.writeFileSync(outPath, result.buffer);
  console.log(`Card saved to: ${outPath}`);
  console.log(`Size: ${(result.buffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
