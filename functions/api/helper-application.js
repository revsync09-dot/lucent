import { createClient } from '@supabase/supabase-js';

const GAME_QUESTIONNAIRES = {
  ALS: [
    'Do you got tui goku glitch (photo)',
    'Can you solo the new event gamemode',
    'How many hours are you available',
    'Do you have the meta units for the update with glitch or double avatar'
  ],
  AG: [
    'Picture of the meta units with ultima',
    'Are you able to solo new event gamemode',
    'Are you able to do 1000% for all types of gamemode',
    'How many hours your available',
    'Picture of artifacts'
  ],
  AC: [
    'Can you solo all content',
    'Picture of meta units',
    'How many hours are you available',
    'What lvl are you ingame'
  ],
  UTD: [
    'What level are you ingame?',
    'What are your best units (in a image)',
    'How many hours are you available',
    'Can you solo all content'
  ],
  AV: [
    'Are you able to go through new update',
    'Do you got meta units with monarch(picture)',
    'Do you have most of the vanguards units (picture)',
    'Are you able to do the vanguard units quest line',
    'How many hours are you available'
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
    'How would you help a new player progress quickly in Sailor Piece?',
    'What is your step-by-step plan when carrying someone through bosses or grinding?',
    'How do you deal with a player who keeps dying during farming or bosses?',
    'How do you explain grinding routes or farming methods clearly?',
    'What do you focus on more when helping: levels, gear, or money? Why?',
    'How do you adapt if a player has very weak stats or bad equipment?',
    'If a player doesn’t follow your instructions, what do you do?',
    'How do you make grinding less boring for the player you are helping?'
  ],
  ARX: [
    'How would you carry a low-level player through a difficult ARX stage step by step?',
    'What do you do if the player places units incorrectly during a run?',
    'How do you adjust your strategy if your carry is about to fail?',
    'How do you explain unit placement to a beginner in ARX?',
    'What do you prioritize during a carry: protecting the base or maximizing damage? Why?',
    'How do you manage timing and ability usage during a carry?',
    'If a player is too slow in ARX, how do you handle it without being toxic?',
    'How do you choose which units to use when carrying weaker players?'
  ],
  ASTD: [
    'Do you have cooler and aizen',
    'Do you have 3x (not need)',
    'Do you have the meta units',
    'Do you have most of the 7 stars (picture included with previous question)',
    'How many hours are you available',
    'Are you able to solo the raids',
    'How far are you able to reach in gauntlet, infinite, and farm',
    'Are you able to solo trial 25-100 on extreme'
  ],
  APX: [
    'Can you solo all content',
    'Picture of meta units',
    'How many hours are you available',
    'What lvl are you ingame',
    'What is your highest wave in siege mode'
  ]
};

function normalizeCategoryResponses(input, strongestGames) {
  const selectedGames = new Set(Array.isArray(strongestGames) ? strongestGames : []);
  const result = {};
  if (!input || typeof input !== 'object') return result;

  for (const [gameCode, questions] of Object.entries(GAME_QUESTIONNAIRES)) {
    if (!selectedGames.has(gameCode)) continue;
    const items = Array.isArray(input[gameCode]) ? input[gameCode] : [];
    result[gameCode] = questions.map((question, index) => ({
      question,
      answer: String(items[index]?.answer || '').trim().slice(0, 500)
    }));
  }

  return result;
}

function decodeAttachment(dataUrl) {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const extensionMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  };
  const extension = extensionMap[mime];
  if (!extension) return null;

  const binaryString = atob(match[2]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return { mime, extension, buffer: bytes };
}

function buildDiscordFormData(payload, attachments) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  attachments.forEach((item, index) => {
    const decoded = decodeAttachment(item?.dataUrl);
    if (!decoded) return;
    const baseName = String(item?.name || `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    form.append(
      `files[${index}]`,
      new Blob([decoded.buffer], { type: decoded.mime }),
      `${String(index + 1).padStart(2, '0')}-${baseName}.${decoded.extension}`
    );
  });
  return form;
}

function gameEmojiMarkup(env, code) {
  const envMap = {
    ALS: ['EMOJI_SERVICE_ALS_ID', 'EMOJI_SERVICE_ALS_NAME', 'ALS'],
    AG: ['EMOJI_SERVICE_AG_ID', 'EMOJI_SERVICE_AG_NAME', 'AG'],
    AC: ['EMOJI_SERVICE_AC_ID', 'EMOJI_SERVICE_AC_NAME', 'AC'],
    UTD: ['EMOJI_SERVICE_UTD_ID', 'EMOJI_SERVICE_UTD_NAME', 'UTD'],
    AV: ['EMOJI_SERVICE_AV_ID', 'EMOJI_SERVICE_AV_NAME', 'AV'],
    BL: ['EMOJI_SERVICE_BL_ID', 'EMOJI_SERVICE_BL_NAME', 'BL'],
    SP: ['EMOJI_SERVICE_SP_ID', 'EMOJI_SERVICE_SP_NAME', 'Sailor_Piece'],
    ARX: ['EMOJI_SERVICE_ARX_ID', 'EMOJI_SERVICE_ARX_NAME', 'ARX', 'EMOJI_SERVICE_ARX', 'EMOJI_SERVICE_ARX_LABEL'],
    ASTD: ['EMOJI_SERVICE_ASTD_ID', 'EMOJI_SERVICE_ASTD_NAME', 'ASTD']
  };
  const config = envMap[code];
  if (!config) return '🎮';
  const [idKey, nameKey, fallbackName, idFallbackKey, nameFallbackKey] = config;
  const emojiId = String(env[idKey] || (idFallbackKey ? env[idFallbackKey] : '') || '').trim();
  const emojiName = String(env[nameKey] || (nameFallbackKey ? env[nameFallbackKey] : '') || fallbackName)
    .trim()
    .replace(/^:+|:+$/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_');
  return emojiId ? `<:${emojiName}:${emojiId}>` : '🎮';
}

export async function onRequest(context) {
  const { env, request } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = env.DISCORD_TOKEN;
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  const finalChannelId = env.HELPER_APPLICATION_CHANNEL_ID || env.LOG_CHANNEL_ID;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials missing.' }), { status: 500, headers });
  }

  try {
    const data = await request.json();
    if (!data.discordUserId || data.discordUserId.length < 15) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers });
    }

    if (!Array.isArray(data.strongestGames) || data.strongestGames.length !== 1) {
      return new Response(JSON.stringify({ error: 'Select exactly one game application.' }), { status: 400, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const categoryResponses = normalizeCategoryResponses(data.categoryResponses, data.strongestGames);
    for (const [gameCode, responses] of Object.entries(categoryResponses)) {
      if (responses.some((entry) => !entry.answer)) {
        return new Response(JSON.stringify({ error: `Answer all ${gameCode} helper questions.` }), { status: 400, headers });
      }
    }

    const { data: inserted, error: dbError } = await supabase
      .from('helper_applications')
      .insert([{
        discord_tag: data.discordTag,
        discord_user_id: data.discordUserId,
        age: data.age,
        timezone: data.timezone,
        availability: data.availability,
        experience: data.experience,
        motivation: data.motivation,
        proofs: data.proofs,
        strongest_games: data.strongestGames,
        screenshots: data.screenshots
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    const referenceId = inserted.id.split('-')[0].toUpperCase();
    const expertiseString = (data.strongestGames || [])
      .map((game) => `${gameEmojiMarkup(env, game)} **${game}**`)
      .join('\n');

    let userAvatar = null;
    let userName = data.discordTag || 'Unknown Candidate';
    if (discordToken) {
      try {
        const userResponse = await fetch(`https://discord.com/api/v10/users/${data.discordUserId}`, {
          headers: { Authorization: `Bot ${discordToken.trim().replace(/^"|"$/g, '')}` }
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          userName = userData.discriminator && userData.discriminator !== '0'
            ? `${userData.username}#${userData.discriminator}`
            : userData.username;
          if (userData.avatar) {
            userAvatar = `https://cdn.discordapp.com/avatars/${data.discordUserId}/${userData.avatar}.png?size=256`;
          }
        }
      } catch (e) {
        console.error('Identity fetch failed:', e.message);
      }
    }

    const categoryFields = Object.entries(categoryResponses).map(([gameCode, responses]) => ({
      name: `${gameCode} Questions`,
      value: responses
        .map((entry, index) => `${index + 1}. ${entry.question}\n${entry.answer || 'No answer provided.'}`)
        .join('\n\n')
        .slice(0, 1024),
      inline: false
    }));

    const payload = {
      content: `<@&${env.HELPER_STAFF_ROLE || '1452363575464034396'}> A new application has been submitted!`,
      embeds: [
        {
          author: { name: `Applicant: ${userName}`, icon_url: userAvatar || undefined },
          title: `📑 HYPERIONS DOSSIER: ${referenceId}`,
          description:
            `<@${data.discordUserId}> has submitted an application for **${(data.strongestGames || ['Unknown Game']).join(', ')}** Helper.\n\n` +
            `**Selected Games**\n${expertiseString || 'None'}\n\n` +
            `**1. What's Your Combat & Carry Experience?**\n${(data.experience || 'None').substring(0, 1000)}\n\n` +
            `**2. Why do you want to join Hyperions?**\n${(data.motivation || 'None').substring(0, 1000)}\n\n` +
            `**3. What's Your Availability Schedule?**\n${(data.availability || 'None').substring(0, 1000)}\n\n` +
            `**4. Age & Timezone**\nAge: ${data.age || 'N/A'}, Timezone: ${data.timezone || 'CET'}\n\n` +
            `**5. Additional Proofs (Links, Vouches)**\n${(data.proofs || 'None').substring(0, 500)}`,
          color: 0x5865F2,
          fields: categoryFields,
          footer: { text: `Hyperions Intelligence Agency Audit • Ref: ${referenceId}` },
          timestamp: new Date().toISOString()
        }
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Accept', custom_id: `hacc:${data.discordUserId}:${referenceId}`, emoji: { name: '✅' } },
            { type: 2, style: 4, label: 'Reject', custom_id: `hrej:${data.discordUserId}:${referenceId}`, emoji: { name: '✖️' } },
            { type: 2, style: 2, label: 'View History', custom_id: `hlphist:${data.discordUserId}`, emoji: { name: '📜' } }
          ]
        }
      ]
    };

    let botDelivered = false;
    let debugInfo = '';
    const attachments = Array.isArray(data.screenshots) ? data.screenshots.slice(0, 4) : [];

    if (discordToken) {
      try {
        const botResponse = await fetch(`https://discord.com/api/v10/channels/${finalChannelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${discordToken.trim().replace(/^"|"$/g, '')}` },
          body: buildDiscordFormData(payload, attachments)
        });
        if (botResponse.ok) {
          botDelivered = true;
        } else {
          const err = await botResponse.json().catch(() => ({}));
          debugInfo = `Bot API: ${err.message || 'Unauthorized/Missing Perms'}`;
        }
      } catch (e) {
        debugInfo = `Bot Error: ${e.message}`;
      }
    }

    let webhookDelivered = false;
    if (!botDelivered && webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          body: buildDiscordFormData({ ...payload, components: [] }, attachments)
        });
        webhookDelivered = webhookResponse.ok;
      } catch (e) {
        console.error('Webhook fallback failed:', e.message);
      }
    }

    if (!botDelivered && !webhookDelivered) {
      return new Response(JSON.stringify({
        error: 'Application saved but Discord delivery failed.',
        details: debugInfo || 'No bot token access and webhook fallback unavailable.'
      }), { status: 502, headers });
    }

    return new Response(JSON.stringify({
      success: true,
      referenceId,
      warning: botDelivered ? null : `Bot Delivery failed (${debugInfo}). Used Webhook fallback (No buttons).`
    }), { status: 200, headers });
  } catch (err) {
    console.error('API Error:', err);
    return new Response(JSON.stringify({ error: 'System Error', details: err.message }), { status: 500, headers });
  }
}
