const { createClient } = require('@supabase/supabase-js');

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
    'Explain how pity works in Arx using Solar Fist as an example. Include BOTH drop rate and how pity affects probability over time.',
    'What is more valuable long-term: grinding pity or relying on luck? Explain why.',
    'If a player has 7/10 Ranger Crystals, what is the MOST efficient way to finish hyper evolve?',
    'Explain ALL requirements and risks of shiny transfer. Include what could go wrong.',
    'What is the biggest mistake new players make with resources?',
    'List EVERYTHING you can obtain from Platinum Chests and rank them by value.',
    'What makes a unit "meta" in Arx? Give at least 3 factors.',
    'A player is stuck in Ghoul Story with decent units but keeps losing. What EXACT steps do you tell them? (Step-by-step)',
    'A beginner pulls a rare unit early. Should they invest everything into it? Why or why not?',
    'A player complains raids are too hard. How do you respond AND help them improve?',
    'A player wastes resources on a bad unit. What do you say?',
    'Build a Calamity team and explain EACH unit’s role (DPS, support, etc.)',
    'Compare these units in terms of value: Gojo, Shinra, Sukuna, Yoki. Who is best and in what situation?',
    'Create a full beginner → midgame progression path in under 10 steps.',
    'If you had to restart with nothing, what would you do differently?',
    'Why should we pick you over other applicants?'
  ],
  ASTD: [
    'What does bleed stacking actually do, and why is it strong in late-game Infinite?',
    'How does the damage formula scale with multiple buffs (Erwin + Brook, etc.)?',
    'What’s the difference between true damage vs normal damage in high waves?',
    'Which enemies are immune to time stop, and how do you deal with them effectively?',
    'What is the optimal placement strategy for Infinite leaderboard runs?',
    'Why is timing buffs more important than stacking them instantly?',
    'When is the ideal point to stop farming and transition to DPS?',
    'How do you maximize DPS using manual ability timing instead of auto?',
    'Why do top players avoid over-upgrading units early?',
    'What makes a unit "meta" vs just "strong"?',
    'Why are some 7★ units worse than certain 6★ units in Infinite?',
    'Which roles are mandatory in leaderboard teams, and why? (Explain roles, don’t just list units)',
    'What makes a good support unit in endgame compared to early game?',
    'How does spawn timing manipulation affect enemy grouping and DPS efficiency?',
    'What is unit placement optimization, and why does it matter?',
    'How do top players handle shielded + high-speed enemies simultaneously?',
    'What role do slowing units play in late waves, even with resistance?',
    'How do you build a team for wave 100+ pushing? (Focus on roles + synergy)',
    'Why is upgrading too fast worse than upgrading slowly in some runs?',
    'What is the biggest mistake new "endgame" players make in Infinite?',
    'How do you recover a run when your timing gets messed up mid-wave?',
    'Why do some players intentionally leak early enemies?',
    'What separates a top 1% player from a "good" player?'
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

  return {
    mime,
    extension,
    buffer: Buffer.from(match[2], 'base64')
  };
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

function gameEmojiMarkup(code) {
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
  const emojiId = String(process.env[idKey] || (idFallbackKey ? process.env[idFallbackKey] : '') || '').trim();
  const emojiName = String(process.env[nameKey] || (nameFallbackKey ? process.env[nameFallbackKey] : '') || fallbackName)
    .trim()
    .replace(/^:+|:+$/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_');
  return emojiId ? `<:${emojiName}:${emojiId}>` : '🎮';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = process.env.DISCORD_TOKEN;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const finalChannelId = process.env.HELPER_APPLICATION_CHANNEL_ID || '1446695293944074351';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing.' });
  }

  const data = req.body;
  if (!data.discordUserId || data.discordUserId.length < 15) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (!Array.isArray(data.strongestGames) || data.strongestGames.length !== 1) {
      return res.status(400).json({ error: 'Select exactly one game application.' });
    }

    const categoryResponses = normalizeCategoryResponses(data.categoryResponses, data.strongestGames);
    for (const [gameCode, responses] of Object.entries(categoryResponses)) {
      if (responses.some((entry) => !entry.answer)) {
        return res.status(400).json({ error: `Answer all ${gameCode} helper questions.` });
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
      .map((game) => `${gameEmojiMarkup(game)} **${game}**`)
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
          headers: {
            Authorization: `Bot ${discordToken.trim().replace(/^"|"$/g, '')}`
          },
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

    if (!botDelivered && webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          body: buildDiscordFormData({ ...payload, components: [] }, attachments)
        });
      } catch (e) {
        console.error('Webhook fallback failed:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      referenceId,
      warning: botDelivered ? null : `Bot Delivery failed (${debugInfo}). Used Webhook fallback (No buttons).`
    });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'System Error', details: err.message });
  }
};
