const DISCORD_API = 'https://discord.com/api/v10';

function sanitizeName(value, fallback = 'trade') {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 80) || fallback;
}

async function discordRequest(env, path, options = {}) {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error('Discord token missing');

  const response = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status}: ${text || path}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function publishTradePostToDiscord(env, trade) {
  const channelId = env.TRADE_CHANNEL_ID || env.VOUCH_CHANNEL_ID;
  if (!channelId) return null;

  const gameKey = String(trade.game_key || '').toUpperCase();
  const embed = {
    title: 'Hyperions Trade Offer',
    color: 0x7c6fff,
    description: [
      `**Game:** \`${gameKey}\``,
      '',
      '**Offering:**',
      String(trade.trading_item || 'N/A'),
      '',
      '**Looking For:**',
      String(trade.looking_for || 'N/A')
    ].join('\n'),
    timestamp: new Date(trade.created_at || Date.now()).toISOString()
  };

  const payload = {
    content: `New trade offer in **${gameKey}**`,
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: `trade:accept:${trade.id}`,
            label: 'Accept Trade'
          }
        ]
      }
    ]
  };

  return discordRequest(env, `/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createTradeThreadAndPost(env, trade, match) {
  const channelId = env.TRADE_CHANNEL_ID || env.VOUCH_CHANNEL_ID;
  if (!channelId) throw new Error('Trade channel is missing');

  const ownerName = sanitizeName(match.owner_user_id, 'owner');
  const accepterName = sanitizeName(match.accepter_user_id, 'buyer');
  const threadName = sanitizeName(`${String(trade.game_key || 'trade').toLowerCase()}-${ownerName}-${accepterName}`, 'trade-thread');

  let thread;
  if (trade.message_id) {
    try {
      thread = await discordRequest(env, `/channels/${channelId}/messages/${trade.message_id}/threads`, {
        method: 'POST',
        body: JSON.stringify({
          name: threadName,
          auto_archive_duration: 1440
        })
      });
    } catch (_) {}
  }

  if (!thread) {
    thread = await discordRequest(env, `/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        name: threadName,
        auto_archive_duration: 1440,
        type: 12,
        invitable: false
      })
    });
  }

  await Promise.all([
    discordRequest(env, `/channels/${thread.id}/thread-members/${match.owner_user_id}`, { method: 'PUT' }).catch(() => null),
    discordRequest(env, `/channels/${thread.id}/thread-members/${match.accepter_user_id}`, { method: 'PUT' }).catch(() => null)
  ]);

  const mmRole = env.TRADE_MIDDLEMAN_ROLE_ID || env.TRADE_MATCH_ROLE_ID || env.TRADE_MOD_ROLE_ID || '';
  const contentParts = [
    `<@${match.owner_user_id}>`,
    `<@${match.accepter_user_id}>`
  ];
  if (trade.settings?.middlemanRequired && mmRole) {
    contentParts.unshift(`<@&${mmRole}>`);
  }

  await discordRequest(env, `/channels/${thread.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: contentParts.join(' '),
      allowed_mentions: {
        users: [match.owner_user_id, match.accepter_user_id],
        roles: mmRole ? [mmRole] : []
      },
      embeds: [
        {
          title: 'Hyperions Trade Match',
          color: 0x7c6fff,
          description: [
            `**Owner:** <@${match.owner_user_id}>`,
            `**Accepter:** <@${match.accepter_user_id}>`,
            '',
            `**Owner Offer:** ${trade.trading_item}`,
            `**Requested:** ${trade.looking_for}`,
            '',
            'Use the buttons below after the in-game trade is finished.'
          ].join('\n'),
          timestamp: new Date().toISOString()
        }
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, custom_id: `trade:confirm:${match.id}`, label: 'Confirm Trade' },
            { type: 2, style: 4, custom_id: `trade:cancel:${match.id}`, label: 'Cancel Trade' },
            { type: 2, style: 2, custom_id: `trade:mm:${match.id}`, label: 'Request Middleman' }
          ]
        }
      ]
    })
  });

  return thread;
}
