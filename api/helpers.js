const https = require('https');

const avatarCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

const HELPERS = [
  { username: "Sherlock1391",        roblox: "Sherlock1391",        id: "857581573670699050",   games: "AC, AG, AV, SP",                            active: "2pm - 6pm (GMT+5:30)" },
  { username: "Stevbetterfr",        roblox: "Stevbetterfr",        id: "876131831836188673",   games: "Anime Vanguard (AV)",                        active: "4pm - 9pm EST" },
  { username: "Gear5ththegoat",      roblox: "Gear5ththegoat",      id: "1482030274404417660",  games: "Anime Guardians (AG)",                       active: "Mon - Sun: 1pm - 12pm" },
  { username: "Lazyraptorrrr",       roblox: "Lazyraptorrrr",       id: "814377589635678218",   games: "Anime Crusaders (AC)",                       active: "Afternoon and Night" },
  { username: "marcell legit",       roblox: "marcell legit",       id: "1176260858372948058",  games: "AC, ALS, AV, BL",                            active: "Every possible hour" },
  { username: "pulse0798",           roblox: "doofymasteryt",       id: "1426958183976407195",  games: "BL, AG, ALS",                                active: "Afternoon and Night" },
  { username: "Princesspuppy63",     roblox: "Princesspuppy63",     id: "407382363551563777",   games: "Anime Crusaders, Anime Vanguard",             active: "Thu - Sun night (GMT-3)" },
  { username: "Forseti_445",         roblox: "Forseti_445",         id: "756517690163855540",   games: "Bizarre Lineage, UTD",                       active: "8pm - 2am GMT" },
  { username: "Adamhm2010",          roblox: "Adamhm2010",          id: "1411719764275105823",  games: "Bizarre Lineage (BL)",                       active: "Morning (2-4 hours)" },
  { username: "ArmedZane",           roblox: "ArmedZane",           id: "1230982596297625651",  games: "General Support",                            active: "3pm - 1am (UTC+2)" },
  { username: "RDXGAMER615MSD1",     roblox: "RDXGAMER615MSD1",     id: "738578236576890920",   games: "ALS",                                        active: "Sun-Thu: 3-10pm, Fri-Sat: 12pm-3am (GMT+2)" },
  { username: "Bannthemann",         roblox: "Bannthemann",         id: "1109849512429764720",  games: "Bizarre Lineage (BL)",                       active: "3pm - 10pm (GMT+3)" },
  { username: "torta_fr",            roblox: "Biscuit_nutella973",  id: "1074743406632374282",  games: "ALS, Bizarre Lineage (BL)",                  active: "7am - 12pm & 6pm - 10pm (UTC-3)" },
  { username: "-LUCKY_SPINSBASKET",  roblox: "-LUCKY_SPINSBASKET",  id: "925988522870050846",   games: "Bizarre Lineage (BL)",                       active: "Midday" },
  { username: "shrell0437",          roblox: "ihatenub44",          id: "1298805101481168906",  games: "Bizarre Lineage (BL)",                       active: "4pm - 2am (GMT+8)" },
  { username: "alwa3ee",             roblox: "k3nkan3ki09",         id: "1340030733229494384",  games: "Anime Guardians (AG), Anime Crusaders (AC)", active: "N/A" },
];

const FALLBACK = 'https://cdn.discordapp.com/embed/avatars/0.png';

function postJson(hostname, path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'HyperionsBot/1.0',
        Accept: 'application/json'
      },
      timeout: 7000
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function getJson(hostname, path) {
  return new Promise((resolve) => {
    const req = https.get({
      hostname,
      path,
      headers: { 'User-Agent': 'HyperionsBot/1.0', Accept: 'application/json' },
      timeout: 7000
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function getRobloxAvatar(robloxUsername) {
  const key = robloxUsername.toLowerCase();
  const cached = avatarCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  const usersRes = await postJson('users.roblox.com', '/v1/usernames/users', {
    usernames: [robloxUsername],
    excludeBannedUsers: false
  });

  const userId = usersRes?.data?.[0]?.id;
  if (!userId) {
    avatarCache.set(key, { url: FALLBACK, ts: Date.now() });
    return FALLBACK;
  }

  const thumbRes = await getJson(
    'thumbnails.roblox.com',
    `/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
  );

  const url = thumbRes?.data?.[0]?.imageUrl || FALLBACK;
  avatarCache.set(key, { url, ts: Date.now() });
  return url;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const helpers = HELPERS.map(h => ({ ...h }));

  const BATCH = 4;
  for (let i = 0; i < helpers.length; i += BATCH) {
    await Promise.all(
      helpers.slice(i, i + BATCH).map(async (h) => {
        try {
          h.avatar = await getRobloxAvatar(h.roblox);
        } catch {
          h.avatar = FALLBACK;
        }
      })
    );
    if (i + BATCH < helpers.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  if (typeof res.status === 'function') {
    return res.status(200).json(helpers);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify(helpers));
};
