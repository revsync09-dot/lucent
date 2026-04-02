const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { env } = require('../config');
const { createModmailConversation, getModmailConversation, getModmailByThread, addModmailMessage, getModmailMessages, setModmailThread, closeModmailConversation, getUnforwardedModmail, markModmailForwarded, deleteOldModmailData, getHelperPresenceCounts } = require('./supabase');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const APPLICATION_LOG_FILE = path.join(__dirname, '..', '..', 'data', 'helper-applications.jsonl');
const APPLICATION_ASSET_DIR = path.join(__dirname, '..', '..', 'data', 'helper-application-assets');
const HELPER_APP_ACCEPT_PREFIX = 'helperapp:accept';
const HELPER_APP_REJECT_PREFIX = 'helperapp:reject';
const MODMAIL_CHANNEL_ID = process.env.MODMAIL_CHANNEL_ID || '';
let _client = null;
let _startTime = Date.now();
let _supabase = null;
function init(client, supabase) {
  _client    = client;
  _supabase  = supabase;
  _startTime = Date.now();
}
async function getStatusData() {
  const uptime = Math.floor((Date.now() - _startTime) / 1000);
  const ping = _client ? Math.round(_client.ws.ping) : -1;
  const guilds = _client ? _client.guilds.cache.size : 0;
  const version = '3.4.1 (Custom Emoji Patch)';

  let tickets = 0;
  let vouches = 0;
  let dbOnline = false;

  if (_supabase) {
    try {
      const [{ data: tData, count: tCount, error: tErr }, { data: vData, count: vCount, error: vErr }] = await Promise.all([
        _supabase.from('carry_tickets').select('id', { count: 'exact', head: true }).is('closed_at', null),
        _supabase.from('vouches').select('id', { count: 'exact', head: true })
      ]);
      tickets = tCount || 0;
      vouches = vCount || 0;
      dbOnline = !tErr && !vErr;
    } catch (_) {}
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const cpus = os.cpus();
  const cpuUsagePercent = Math.min(100, Math.round((os.loadavg()[0] / cpus.length) * 100));

  const getEmojiId = (envKey, configVal) => {
    const fromEnv = process.env[envKey];
    if (fromEnv && /^\d{17,20}$/.test(fromEnv.trim())) return fromEnv.trim();
    return configVal;
  };

  const helperPresence = await getHelperPresenceCounts(env.guildId).catch(() => ({}));
  const { count: unclaimedCount } = _supabase ? await _supabase.from('carry_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open').is('claimed_by', null).catch(() => ({ count: 0 })) : { count: 0 };

  return {
    status: 'operational',
    uptime,
    ping,
    guilds,
    tickets,
    vouches,
    unclaimedTickets: unclaimedCount || 0,
    helperPresence,
    version,
    dbOnline,
    ram: ramUsagePercent,
    cpu: cpuUsagePercent,
    timestamp: new Date().toISOString(),
    emojis: {
      bot: getEmojiId('EMOJI_LOG_ID', env.emojis.log),
      ticket: getEmojiId('EMOJI_TICKET_CLAIM_ID', env.emojis.ticketClaim),
      db: getEmojiId('EMOJI_BULLET_ID', env.emojis.bullet),
      host: getEmojiId('EMOJI_TITLE_ID', env.emojis.title.id),
      website: {
        uptime: getEmojiId('EMOJI_WEBSITE_UPTIME_ID', env.emojis.website.uptime),
        ping: getEmojiId('EMOJI_WEBSITE_PING_ID', env.emojis.website.ping),
        tickets: getEmojiId('EMOJI_WEBSITE_TICKETS_ID', env.emojis.website.tickets),
        vouches: getEmojiId('EMOJI_WEBSITE_VOUCHES_ID', env.emojis.website.vouches),
        rules: getEmojiId('EMOJI_WEBSITE_RULES_ID', env.emojis.website.rules),
        payment: getEmojiId('EMOJI_WEBSITE_PAYMENT_ID', env.emojis.website.payment),
        quota: getEmojiId('EMOJI_WEBSITE_QUOTA_ID', env.emojis.website.quota),
        info: getEmojiId('EMOJI_WEBSITE_INFO_ID', env.emojis.website.info),
        bot: getEmojiId('EMOJI_LOG_ID', env.emojis.log),
        n01: getEmojiId('EMOJI_WEBSITE_NUMBER_01_ID', env.emojis.website.n01),
        n02: getEmojiId('EMOJI_WEBSITE_NUMBER_02_ID', env.emojis.website.n02),
        n03: getEmojiId('EMOJI_WEBSITE_NUMBER_03_ID', env.emojis.website.n03)
      }
    }
  };
}
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
function cleanText(value, maxLength = 1200) {
  return String(value || '').trim().replace(/\r/g, '').slice(0, maxLength);
}
function sanitizeAssetName(value) {
  return String(value || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'upload';
}
function normalizeGameList(input) {
  if (!Array.isArray(input)) return [];
  const valid = new Set(['ALS', 'AG', 'AC', 'UTD', 'AV', 'BL', 'SP', 'ARX', 'ASTD', 'APX', 'AOL']);
  return [...new Set(input.map((item) => cleanText(item, 12).toUpperCase()).filter((item) => valid.has(item)))];
}
const GAME_QUESTIONNAIRES = {
  ALS: [
    'What is your Roblox username?',
    'How active can you be to help people out in game?',
    'Do you own an 3x speed game pass in anime last stand?',
    'Do you have more than 5 meta glitched units?',
    'Please send an screenshot of your team below'
  ],
  AG: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to solo 3 god mode on max difficulty?',
    'Are you able to solo all of the world lines?',
    'Can you solo the world boss on max difficulty?',
    'Please send an screenshot of your team below'
  ],
  AC: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to solo the New Years Event?',
    'Are you able to solo tier 11 Winter Portals?',
    'Are you able to solo Stark Raid On Hard Mode?',
    'Are you able to solo Bleach Boss Rush?',
    'Please send an screenshot of your team below'
  ],
  UTD: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'What is your current level in UTD?',
    'Do you have the latest Meta towers for raids?',
    'Please send an screenshot of your team below'
  ],
  AV: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'How many Paragon units do you currently own?',
    'Can you solo the latest Infinite Mode stages?',
    'Please send an screenshot of your team below'
  ],
  BL: [
    'usage of any ai software will result in your rejection.',
    'Do you know exactly what stats each stand scales off of?',
    'Give us the top 3 stands you think are best in your opinion.',
    "What's your prestige ingame? (We will verify so do not lie)",
    'How long have you been playing bizzare lineage for?',
    'If a member asks you for help with raids in the server, what will you do?',
    'What makes you a more suitable person for this role instead of the other applicants?',
    'Prove us you are knowledgeable enough for this role by telling us a few key stuff about the game.',
    'How much free time do you approximately have to dedicate into answering questions?',
    'Can you give us a few examples of what questions you are able to answer?',
    'Have you ever participated in gang wars? And if so, did you win?'
  ],
  SP: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'What is your current Fruit and Bounty?',
    'Are you capable of soloing high-difficulty dungeons?',
    'Please send an screenshot of your stats/inventory below'
  ],
  ARX: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'What is your current team composition in ARX?',
    'Are you able to solo the latest Raid difficulty?',
    'Please send an screenshot of your team below'
  ],
  ASTD: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to clear the latest high-difficulty ASTD content consistently?',
    'Do you have the current meta units for farming and progression?',
    'Please send an screenshot of your team below'
  ],
  APX: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to solo Difficulty 10 Extreme?',
    'Are you able to solo Endless Mode wave 100+?',
    'Please send an screenshot of your team below'
  ],
  AOL: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to clear current AOL endgame content?',
    'Do you have the current meta units/team?',
    'Please send an screenshot of your team below'
  ]
};
function normalizeCategoryResponses(input, strongestGames) {
  const selectedGames = new Set(strongestGames || []);
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const [gameCode, questions] of Object.entries(GAME_QUESTIONNAIRES)) {
    if (!selectedGames.has(gameCode)) continue;
    const items = Array.isArray(input[gameCode]) ? input[gameCode] : [];
    result[gameCode] = questions.map((question, index) => ({
      question,
      answer: cleanText(items[index]?.answer, 500)
    }));
  }
  return result;
}
function normalizeScreenshots(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 4)
    .map((item) => ({
      name: sanitizeAssetName(item?.name),
      type: cleanText(item?.type, 40).toLowerCase(),
      dataUrl: cleanText(item?.dataUrl, 8_000_000)
    }))
    .filter((item) => item.dataUrl.startsWith('data:image/'));
}
function decodeScreenshot(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const extensionMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp'
  };
  const extension = extensionMap[mime];
  if (!extension) return null;
  return {
    mime,
    extension,
    buffer: Buffer.from(match[2], 'base64')
  };
}
function validateApplication(payload) {
  const application = {
    referenceId: `HLP-${Date.now().toString(36).toUpperCase()}`,
    submittedAt: new Date().toISOString(),
    discordTag: cleanText(payload.discordTag, 80),
    discordUserId: cleanText(payload.discordUserId, 24),
    age: cleanText(payload.age, 16),
    timezone: cleanText(payload.timezone, 50),
    availability: cleanText(payload.availability, 280),
    experience: cleanText(payload.experience, 1400),
    motivation: cleanText(payload.motivation, 1400),
    strongestGames: normalizeGameList(payload.strongestGames),
    categoryResponses: {},
    screenshots: normalizeScreenshots(payload.screenshots),
    proofs: cleanText(payload.proofs, 400),
    termsAccepted: Boolean(payload.termsAccepted)
  };
  const errors = [];
  application.categoryResponses = normalizeCategoryResponses(payload.categoryResponses, application.strongestGames);
  if (application.discordTag.length < 2) errors.push('Discord name is required.');
  if (!/^\d{17,20}$/.test(application.discordUserId)) errors.push('A valid Discord user ID is required.');
  if (application.strongestGames.length === 0) errors.push('Select at least one supported game.');
  if (application.availability.length < 10) errors.push('Availability is too short.');
  if (application.experience.length < 30) errors.push('Experience is too short.');
  if (application.motivation.length < 30) errors.push('Motivation is too short.');
  if (!application.termsAccepted) errors.push('You must confirm the requirements.');
  if (application.screenshots.length > 4) errors.push('You can upload up to 4 screenshots.');
  for (const gameCode of application.strongestGames) {
    if (!GAME_QUESTIONNAIRES[gameCode]) continue;
    if ((application.categoryResponses[gameCode] || []).some((entry) => !entry.answer)) {
      errors.push(`Answer all ${gameCode} helper questions.`);
    }
  }
  return { application, errors };
}
async function persistScreenshots(application) {
  if (!application.screenshots?.length) return [];
  const dir = path.join(APPLICATION_ASSET_DIR, application.referenceId);
  await fs.promises.mkdir(dir, { recursive: true });
  const files = [];
  for (let index = 0; index < application.screenshots.length; index += 1) {
    const screenshot = application.screenshots[index];
    const decoded = decodeScreenshot(screenshot.dataUrl);
    if (!decoded) continue;
    if (decoded.buffer.length > 5 * 1024 * 1024) {
      throw new Error('Each screenshot must stay below 5 MB.');
    }
    const baseName = sanitizeAssetName(path.parse(screenshot.name || `inventory-${index + 1}`).name);
    const fileName = `${String(index + 1).padStart(2, '0')}-${baseName}${decoded.extension}`;
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, decoded.buffer);
    files.push({ fileName, filePath, mime: decoded.mime });
  }
  return files;
}
async function persistApplication(application) {
  await fs.promises.mkdir(path.dirname(APPLICATION_LOG_FILE), { recursive: true });
  await fs.promises.appendFile(APPLICATION_LOG_FILE, `${JSON.stringify(application)}\n`, 'utf8');
}
async function notifyDiscord(application) {
  const channelId = env.helperApplicationChannelId || process.env.HELPER_APPLICATION_CHANNEL_ID || env.logChannelId || process.env.LOG_CHANNEL_ID;
  if (!_client) throw new Error('Discord client is not ready.');
  if (!channelId) throw new Error('HELPER_APPLICATION_CHANNEL_ID or LOG_CHANNEL_ID is not configured.');
  const channel = await _client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Unable to access helper application channel: ${channelId}`);
  }
  const applicantUser = await _client.users.fetch(application.discordUserId).catch(() => null);
  const dateFormatted = new Date().toLocaleDateString('en-GB', {
       weekday: 'long',
       day: 'numeric',
       month: 'long',
       year: 'numeric',
       hour: '2-digit',
       minute: '2-digit'
  });
  const embedFields = [
    { name: 'Panel', value: 'Hyperions Helper Application', inline: true },
    { name: 'Status', value: 'Pending Review', inline: true },
    { name: 'Application ID', value: application.referenceId, inline: true },
    {
      name: 'Application Information',
      value: `**Submitted At:** ${dateFormatted}\n**Applicant:** <@${application.discordUserId}> (${application.discordTag})\n**Age:** ${application.age || 'N/A'}\n**Timezone:** ${application.timezone || 'N/A'}\n**Games:** ${application.strongestGames.join(', ')}\n**Availability:** ${application.availability}`,
      inline: false
    },
    { name: 'Experience', value: `\`\`\`text\n${application.experience}\n\`\`\``, inline: false },
    { name: 'Motivation', value: `\`\`\`text\n${application.motivation}\n\`\`\``, inline: false }
  ];
  if (application.proofs) {
    embedFields.push({ name: 'Additional Proofs', value: `\`\`\`text\n${application.proofs}\n\`\`\``, inline: false });
  }
  for (const [gameCode, responses] of Object.entries(application.categoryResponses || {})) {
    if (!responses.length) continue;
    embedFields.push({
      name: `${gameCode} Questions`,
      value: `\`\`\`text\n${responses.map((entry, index) => `${index + 1}. ${entry.question}\n${entry.answer || 'No answer provided.'}`).join('\n\n').slice(0, 1000)}\n\`\`\``,
      inline: false
    });
  }
  const v2Embed = {
    author: {
      name: applicantUser ? applicantUser.tag : application.discordTag,
      icon_url: applicantUser ? applicantUser.displayAvatarURL({ extension: 'png' }) : null
    },
    color: 0x5865F2,
    fields: embedFields,
    footer: {
      text: 'Hyperions | Hyperions Team',
      icon_url: _client.user ? _client.user.displayAvatarURL() : null
    }
  };
  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${HELPER_APP_ACCEPT_PREFIX}:${application.discordUserId}:${application.referenceId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${HELPER_APP_REJECT_PREFIX}:${application.discordUserId}:${application.referenceId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );
  const histRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hlphist:${application.discordUserId}`)
      .setLabel('User History')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Secondary)
  );
  await channel.send({
    content: `<@&${process.env.HELPER_STAFF_ROLE || env.staffRoleId || '1452363575464034396'}> New helper application received from <@${application.discordUserId}>!`,
    embeds: [v2Embed],
    files: (application.savedScreenshots || []).map((item) => item.filePath),
    components: [reviewRow, histRow]
  });
}
async function forwardModmailToDiscord(conv, msg, username) {
  if (!_client || !MODMAIL_CHANNEL_ID) return;

  const getEmojiTag = (id, fallback) => {
    if (!id) return fallback;
    const emoji = _client.emojis.cache.get(id);
    return emoji ? emoji.toString() : `<:emoji:${id}>`;
  };

  const chatEmoji = getEmojiTag(process.env.EMOJI_MODMAIL_CHAT_ID, '💬');
  const userEmoji = getEmojiTag(process.env.EMOJI_MODMAIL_USER_ID, '👤');

  try {
    const channel = await _client.channels.fetch(MODMAIL_CHANNEL_ID).catch(() => null);
    if (!channel) { console.error('[modmail] Channel not found'); return; }

    if (conv.thread_id === MODMAIL_CHANNEL_ID) {
      conv.thread_id = null;
    }

    if (!conv.thread_id) {
      const introEmbed = {
        color: 0xa78bfa,
        author: { name: 'Hyperions Modmail', icon_url: _client.user?.displayAvatarURL() },
        title: `${chatEmoji} New Modmail Conversation`,
        description: `**From:** ${username}\n**Session:** \`${conv.session_id.slice(0, 8)}\`\n\nReply in the thread below to respond.`,
        footer: { text: 'Hyperions Modmail System' },
        timestamp: new Date().toISOString()
      };
      const introMsg = await channel.send({ content: '<@&1481716306532372487>', embeds: [introEmbed] });
      try {
        const thread = await introMsg.startThread({
          name: `📩 ${username}`.slice(0, 100),
          autoArchiveDuration: 1440,
          type: ChannelType.PublicThread
        });
        await setModmailThread(conv.session_id, thread.id);
        conv.thread_id = thread.id;
        console.log(`[modmail] Thread ${thread.id} created for ${username}`);
      } catch (threadErr) {
        console.error('[modmail] Thread creation failed:', threadErr.message);

        await setModmailThread(conv.session_id, channel.id);
        conv.thread_id = channel.id;
      }
    }

    let target;
    if (conv.thread_id) {
      target = await _client.channels.fetch(conv.thread_id).catch(() => null);
    }

    if (!target) {
      console.error('[modmail] Target not found after creation attempt');
      return;
    }

    await target.send({
      embeds: [{
        color: 0x22d3ee,
        author: { name: `${username}`, icon_url: _client.user?.displayAvatarURL() },
        description: `${userEmoji} **Message:**\n${msg.content}`,
        footer: { text: `Session: ${conv.session_id.slice(0, 8)}` },
        timestamp: msg.created_at || new Date().toISOString()
      }]
    });
    console.log(`[modmail] Message sent to ${target.isThread() ? 'thread' : 'channel'} ${target.id}`);
  } catch (err) {
    console.error('[modmail] Forward failed:', err.message);
  }
}
async function handleModmailReply(message) {
  if (message.author.bot) return false;
  if (!message.channel?.isThread()) return false;
  const conv = await getModmailByThread(message.channel.id);
  if (!conv || conv.status === 'closed') return false;

  const acceptedEmojiId = process.env.EMOJI_MODMAIL_ACCEPTED_ID;
  const staffName = message.member?.displayName || message.author.username;

  let cleanContent = message.content.trim();

  cleanContent = cleanContent.replace(/^!reply\s+\S+\s+/i, '');

  if (message.attachments.size > 0) {
    message.attachments.forEach(att => {
      cleanContent += (cleanContent ? '\n' : '') + att.url;
    });
  }

  if (!cleanContent) return false;

  await addModmailMessage(conv.id, 'staff', staffName, cleanContent);

  if (acceptedEmojiId) {
    await message.react(acceptedEmojiId).catch(() => null);
  } else {
    await message.react('✅').catch(() => null);
  }

  console.log(`[modmail] Staff ${staffName} replied in thread ${message.channel.id}`);
  return true;
}
function startStatusServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const url = parsedUrl.pathname;
    req.query = Object.fromEntries(parsedUrl.searchParams);

    // Express-like shims for local API compatibility
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return res;
    };
    res.send = (data) => {
      res.end(data);
      return res;
    };
    res.redirect = (url) => {
      res.writeHead(302, { 'Location': url });
      res.end();
      return res;
    };

    if (url === '/api/status') {
      try {
        const staffApi = require('../../api/status');
        await staffApi(req, res);
      } catch (e) {
        console.error('[API Status] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url === '/api/login') {
      try {
        const loginApi = require('../../api/login');
        await loginApi(req, res);
      } catch (e) {
        console.error('[API Login] local server error:', e);
        res.status(500).send('Login failed');
      }
      return;
    }
    if (url === '/api/callback') {
      try {
        const callbackApi = require('../../api/callback');
        await callbackApi(req, res);
      } catch (e) {
        console.error('[API Callback] local server error:', e);
        res.status(500).send('Authentication failed');
      }
      return;
    }
    if (url.startsWith('/api/user-profile')) {
      try {
        const userProfileApi = require('../../api/user-profile');
        await userProfileApi(req, res);
      } catch (e) {
        console.error('[API UserProfile] local server error:', e);
        res.status(500).json({ error: e.message });
      }
      return;
    }
    if (url === '/api/messages') {
      try {
        const messagesApi = require('../../api/messages');
        await messagesApi(req, res);
      } catch (e) {
        console.error('[API Messages] local server error:', e);
        res.status(500).json({ error: e.message });
      }
      return;
    }
    if (url === '/api/helper-card') {
      try {
        const helperCardApi = require('../../api/helper-card');
        await helperCardApi(req, res);
      } catch (e) {
        console.error('[API HelperCard] local server error:', e);
        res.status(500).json({ error: e.message });
      }
      return;
    }
    if (url === '/api/leaderboard-card') {
      try {
        const leaderboardCardApi = require('../../api/leaderboard-card');
        await leaderboardCardApi(req, res);
      } catch (e) {
        console.error('[API LeaderboardCard] local server error:', e);
        res.status(500).json({ error: e.message });
      }
      return;
    }
    // --- Trade System APIs ---
    if (url.startsWith('/api/trades/session')) {
      try {
        const tradeSessionApi = require('../../api/trades/session');
        await tradeSessionApi(req, res);
      } catch (e) {
        console.error('[API TradeSession] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url === '/api/trades') {
      try {
        const tradesApi = require('../../api/trades');
        await tradesApi(req, res);
      } catch (e) {
        console.error('[API Trades] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/trades/create-from-session')) {
      try {
        if (req.method === 'POST') {
          const body = await readRequestBody(req);
          req.body = body ? JSON.parse(body) : {};
        }
        const createTradeApi = require('../../api/trades/create-from-session');
        await createTradeApi(req, res);
      } catch (e) {
        console.error('[API CreateTrade] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/trade-hub')) {
      try {
        const tradeHubApi = require('../../api/trade-hub');
        await tradeHubApi(req, res);
      } catch (e) {
        console.error('[API TradeHub] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/trades/match')) {
      try {
        if (req.method === 'POST') {
          const body = await readRequestBody(req);
          req.body = body ? JSON.parse(body) : {};
        }
        const tradeMatchApi = require('../../api/trades/match');
        await tradeMatchApi(req, res);
      } catch (e) {
        console.error('[API TradeMatch] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/items')) {
      try {
        const itemsApi = require('../../api/items');
        await itemsApi(req, res);
      } catch (e) {
        console.error('[API Items] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/trades/history')) {
      try {
        const tradeHistoryApi = require('../../api/trades/history');
        await tradeHistoryApi(req, res);
      } catch (e) {
        console.error('[API TradeHistory] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/api/wiki/image')) {
      try {
        const wikiImageApi = require('../../api/wiki/image');
        await wikiImageApi(req, res);
      } catch (e) {
        console.error('[API WikiImage] local server error:', e);
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.startsWith('/assets/avatars/')) {
      const fileName = path.basename(url);
      const filePath = path.join(PUBLIC_DIR, 'assets', 'avatars', fileName);
      const ext = path.extname(fileName).toLowerCase();
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      serveFile(res, filePath, mimeTypes[ext] || 'image/png');
      return;
    }
    if (url === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === '/api/modmail' && req.method === 'POST') {
      try {
        const rawBody = await readRequestBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const { action, sessionId, username, content, after } = body;
        if (action === 'send') {
          if (!sessionId || !content?.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Missing sessionId or content' }));
            return;
          }
          const guildId = env.guildId || '0';
          const conv = await createModmailConversation(guildId, sessionId, username || 'Website User');
          const msg = await addModmailMessage(conv.id, 'user', username || 'Website User', content.trim());

          const lower = content.toLowerCase();
          if (lower.includes('helper') && (lower.includes('how') || lower.includes('apply'))) {
            setTimeout(async () => {
              const applyUrl = (env.helperApplicationUrl || 'https://hyperionsapplication.xyz/helper-application').replace(/\/$/, '');
              await addModmailMessage(conv.id, 'staff', 'Hyperions Assistant 🤖', 
                `Hey! I noticed you are interested in becoming a helper. You can find all requirements and the application form here: ${applyUrl}. Do you have any other questions?`);
            }, 1500);
          }

          await forwardModmailToDiscord(conv, msg, username || 'Website User');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message: msg, conversationId: conv.id }));
        } else if (action === 'history') {
          if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Missing sessionId' }));
            return;
          }
          const messages = await getModmailMessages(sessionId, after || null);
          const conv = await getModmailConversation(sessionId);

          const isStaffTyping = conv?.staff_typing_at 
            ? (Date.now() - new Date(conv.staff_typing_at).getTime()) < 10000 
            : false;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            messages,
            status: conv?.status || null,
            isStaffTyping,
            initialMessage: env.modmailInitialMessage,
            stickyMessage: env.modmailStickyMessage
          }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid action' }));
        }
      } catch (err) {
        console.error('[modmail-api]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message || 'Server error' }));
      }
      return;
    }
    if (url === '/api/helpers' && req.method === 'GET') {
      try {
        const helpersApi = require('../../api/helpers');
        await helpersApi(req, res);
      } catch (err) {
        console.error('[API Helpers] local server error:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (url === '/api/helper-application' && req.method === 'POST') {
      try {
        const rawBody = await readRequestBody(req);
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const { application, errors } = validateApplication(payload);
        if (errors.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, errors }));
          return;
        }
        application.savedScreenshots = await persistScreenshots(application);
        await persistApplication(application);
        await notifyDiscord(application);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, referenceId: application.referenceId }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message || 'Failed to submit application.' }));
      }
      return;
    }
    const relativeUrl = url.replace(/^\/+/, '');
    let filePath;
    if (url === '/helpers') {
      filePath = path.join(PUBLIC_DIR, 'helpers.html');
    } else if (url === '/helper-application') {
      filePath = path.join(PUBLIC_DIR, 'helper-application.html');
    } else if (url === '/messages') {
      filePath = path.join(PUBLIC_DIR, 'messages.html');
    } else if (url === '/trade-hub') {
      filePath = path.join(PUBLIC_DIR, 'trade-hub.html');
    } else {
      filePath = path.join(PUBLIC_DIR, relativeUrl || 'index.html');
    }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    serveFile(res, filePath, types[ext] || 'text/plain');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[status] ⚠️ Port ${port} is already in use. This is common during rapid deployments; the server will continue once the port is free.`);
    } else {
      console.error('[status] ❌ Server error:', err.message);
    }
  });

  server.listen(port, () => {
    console.log(`[status] 🌐 Status website running on https://hyperionsapplication.xyz`);
  });
  startModmailPoller();
  return server;
}
let _modmailPolling = false;
async function pollModmailQueue() {
  if (_modmailPolling || !_client || !MODMAIL_CHANNEL_ID) return;
  _modmailPolling = true;
  try {
    const pending = await getUnforwardedModmail();
    if (!pending.length) { _modmailPolling = false; return; }
    const grouped = {};
    for (const msg of pending) {
      const convId = msg.conversation_id;
      if (!grouped[convId]) grouped[convId] = { conv: msg.modmail_conversations, messages: [] };
      grouped[convId].messages.push(msg);
    }
    for (const [convId, group] of Object.entries(grouped)) {
      let conv = group.conv;
      if (!conv) {
        for (const m of group.messages) await markModmailForwarded(m.id);
        continue;
      }
      const freshConv = await getModmailConversation(conv.session_id);
      if (freshConv) conv = freshConv;
      for (const msg of group.messages) {
        try {
          await forwardModmailToDiscord(conv, msg, msg.sender_name || conv.username);
          await markModmailForwarded(msg.id);
        } catch (err) {
          console.error('[modmail-poll] Forward error:', err.message);
          break;
        }
      }
    }
  } catch (err) {
    if (!String(err.message).includes('does not exist')) {
      console.error('[modmail-poll] Poll error:', err.message);
    }
  }
  _modmailPolling = false;
}
function startModmailPoller() {
  setInterval(pollModmailQueue, 5000);
  console.log('[modmail] 📨 Modmail poller started (every 5s)');

  setInterval(() => {
    deleteOldModmailData(24).catch(err => console.error('[modmail] Auto-cleanup error:', err.message));
  }, 60 * 60 * 1000);

  deleteOldModmailData(24).catch(() => null);
}
module.exports = { init, startStatusServer, handleModmailReply };
