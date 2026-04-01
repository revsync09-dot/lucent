const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} = require('discord.js');
const { env, gameMap } = require('../config');
const { getWikiImageData } = require('./wiki');
const {
  supabase,
  createTradeMatch,
  findOpenTradeMatch,
  getTradeMatchById,
  getTradeConfirmations,
  updateTradeMatch,
  updateTradePost,
  upsertTradeConfirmation
} = require('./supabase');

function envEmojiMeta(idKey, nameKey, fallbackName) {
  const id = process.env[idKey] || '';
  const name = String(process.env[nameKey] || fallbackName || 'e').replace(/[^a-zA-Z0-9_]/g, '_') || 'e';
  return id ? { id, name } : null;
}

function emojiComponent(client, emoji, fallback = null) {
  if (!emoji) return fallback;
  if (typeof emoji === 'string') return emoji;
  const cached = client.emojis.cache.get(String(emoji.id));
  if (!cached && !emoji.id) return fallback;
  return {
    id: String(emoji.id),
    name: (cached?.name || emoji.name || 'e').replace(/[^a-zA-Z0-9_]/g, '_'),
    animated: Boolean(cached?.animated || emoji.animated)
  };
}

function emojiString(client, emoji, fallback = '') {
  if (!emoji) return fallback;
  if (typeof emoji === 'string') return emoji;
  const cached = client.emojis.cache.get(String(emoji.id));
  if (!cached && !emoji.id) return fallback;
  const name = (cached?.name || emoji.name || 'e').replace(/[^a-zA-Z0-9_]/g, '_');
  const animated = Boolean(cached?.animated || emoji.animated);
  return `<${animated ? 'a' : ''}:${name}:${emoji.id}>`;
}

function getTradeEmojiSet() {
  return {
    accept: envEmojiMeta('EMOJI_TRADE_ACCEPT_ID', 'EMOJI_TRADE_ACCEPT_NAME', 'trade_accept'),
    confirm: envEmojiMeta('EMOJI_TRADE_CONFIRM_ID', 'EMOJI_TRADE_CONFIRM_NAME', 'trade_confirm'),
    cancel: envEmojiMeta('EMOJI_TRADE_CANCEL_ID', 'EMOJI_TRADE_CANCEL_NAME', 'trade_cancel'),
    thread: envEmojiMeta('EMOJI_TRADE_THREAD_ID', 'EMOJI_TRADE_THREAD_NAME', 'trade_thread'),
    completed: envEmojiMeta('EMOJI_TRADE_COMPLETED_ID', 'EMOJI_TRADE_COMPLETED_NAME', 'trade_complete'),
    middleman: envEmojiMeta('EMOJI_TRADE_MM_ID', 'EMOJI_TRADE_MM_NAME', 'trade_middleman')
  };
}

function parseTradeItems(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function normalizeSelectedItems(value) {
  return Array.isArray(value)
    ? value
      .map((item) => ({
        item_name: String(item?.item_name || '').trim(),
        image_url: item?.image_url || null,
        category: item?.category || item?.item_type || null,
        rarity: item?.rarity || null
      }))
      .filter((item) => item.item_name)
    : [];
}

async function resolveTradeChannel(client, trade) {
  const guild = await client.guilds.fetch(trade.guild_id).catch(() => null);
  if (!guild) return { guild: null, channel: null };
  const gameKey = (trade.game_key || 'ALS').toUpperCase();
  const channelId = env.tradeChannelId || env.vouchChannelId;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return { guild, channel };
}

async function buildTradeContainer(client, trade) {
  const gameKey = (trade.game_key || 'ALS').toUpperCase();
  const gameInfo = gameMap[gameKey] || { label: gameKey };
  const user = await client.users.fetch(trade.user_id).catch(() => null);
  const avatarUrl = user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null;
  const selectedTrading = normalizeSelectedItems(trade.settings?.selectedTrading);
  const selectedLooking = normalizeSelectedItems(trade.settings?.selectedLooking);
  const firstItem = selectedTrading[0]?.item_name || String(trade.trading_item || '').split(/[\n,]/)[0].trim();
  const wikiImage = selectedTrading[0]?.image_url || (firstItem ? await getWikiImageData(gameKey, firstItem) : null);
  const thumbnailURL = wikiImage || avatarUrl || client.user.displayAvatarURL();
  const tradingPreview = selectedTrading.length
    ? selectedTrading
    : parseTradeItems(trade.trading_item).map((item) => ({ item_name: item }));
  const lookingPreview = selectedLooking.length
    ? selectedLooking
    : parseTradeItems(trade.looking_for).map((item) => ({ item_name: item }));
  const galleryImages = [...selectedTrading, ...selectedLooking]
    .map((item) => item.image_url)
    .filter(Boolean)
    .slice(0, 8);

  const formatTradeBlock = (items, label, fallbackValue) => {
    const lines = items.length
      ? items.slice(0, 6).map((item) => {
        const meta = [item.category || item.item_type, item.rarity].filter(Boolean).join(' • ');
        return meta ? `• **${item.item_name}** (${meta})` : `• **${item.item_name}**`;
      })
      : parseTradeItems(fallbackValue).slice(0, 6).map((item) => `• **${item}**`);

    return [
      label,
      ...lines,
      items.length > 6 ? `• +${items.length - 6} more item(s)` : null
    ].filter(Boolean).join('\n');
  };

  const container = new ContainerBuilder().setAccentColor(0x7c6fff);
  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojiString(client, env.emojis.trade.header, '💎')} **HYPERNARIOS | Trade Offer**`))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL));

  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (galleryImages.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        galleryImages.map((url) => new MediaGalleryItemBuilder().setURL(url))
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }

  const tradeLines = [
    `${env.emojis.trade.user} **Trader:** <@${trade.user_id}>`,
    `Game: \`${gameInfo.label}\``,
    '',
    formatTradeBlock(tradingPreview, `${env.emojis.trade.item} **Offering**`, trade.trading_item),
    '',
    formatTradeBlock(lookingPreview, `${env.emojis.trade.looking} **Looking For**`, trade.looking_for)
  ];

  if (trade.settings?.notes) {
    tradeLines.push('', `Notes`, String(trade.settings.notes));
  }
  tradeLines.push('', `${env.emojis.trade.time} **Posted:** <t:${Math.floor(new Date(trade.created_at || Date.now()).getTime() / 1000)}:R>`);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(tradeLines.join('\n')));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const tradeEmoji = getTradeEmojiSet();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:accept:${trade.id}`)
      .setLabel('Accept Trade')
      .setEmoji(emojiComponent(client, tradeEmoji.accept, '🤝'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trade:settings:${trade.id}`)
      .setLabel('Settings')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`trade:history:${trade.user_id}`)
      .setLabel('History')
      .setStyle(ButtonStyle.Secondary)
  );
  container.addActionRowComponents(row);
  return { container, gameInfo };
}

async function publishTradeToDiscord(client, trade) {
  const { guild, channel } = await resolveTradeChannel(client, trade);
  if (!guild || !channel || !channel.isTextBased()) return null;

  const { container, gameInfo } = await buildTradeContainer(client, trade);
  const message = await channel.send({
    content: `New trade offer in **${gameInfo.label}**!`,
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
  await updateTradePost(trade.id, { message_id: message.id }).catch(() => null);
  return message;
}

async function createTradeThreadForMatch(client, trade, match) {
  const { guild, channel } = await resolveTradeChannel(client, trade);
  if (!guild || !channel || !channel.isTextBased()) throw new Error('Trade channel unavailable');

  let sourceMessage = null;
  if (trade.message_id) {
    sourceMessage = await channel.messages.fetch(trade.message_id).catch(() => null);
  }

  const ownerUser = await client.users.fetch(match.owner_user_id).catch(() => null);
  const accepterUser = await client.users.fetch(match.accepter_user_id).catch(() => null);
  const threadName = `${(trade.game_key || 'trade').toLowerCase()}-${(ownerUser?.username || 'owner').slice(0, 12)}-${(accepterUser?.username || 'buyer').slice(0, 12)}`;

  let thread;
  if (sourceMessage && typeof sourceMessage.startThread === 'function') {
    thread = await sourceMessage.startThread({
      name: threadName,
      autoArchiveDuration: 1440,
      reason: `Trade match ${match.id}`
    });
  } else if (channel.threads?.create) {
    thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Trade match ${match.id}`
    });
  } else {
    throw new Error('Trade thread creation is not supported in this channel');
  }

  await thread.members.add(match.owner_user_id).catch(() => null);
  await thread.members.add(match.accepter_user_id).catch(() => null);

  const pingRole = env.tradeMatchRoleId ? `<@&${env.tradeMatchRoleId}> ` : '';
  const middlemanRoleId = process.env.TRADE_MIDDLEMAN_ROLE_ID || env.tradeMatchRoleId || '';
  const tradeEmoji = getTradeEmojiSet();
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:confirm:${match.id}`)
      .setLabel('Confirm Trade')
      .setEmoji(emojiComponent(client, tradeEmoji.confirm, '✅'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trade:cancel:${match.id}`)
      .setLabel('Cancel Trade')
      .setEmoji(emojiComponent(client, tradeEmoji.cancel, '✖️'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`trade:mm:${match.id}`)
      .setLabel('Request Middleman')
      .setEmoji(emojiComponent(client, tradeEmoji.middleman, '🛡️'))
      .setStyle(ButtonStyle.Secondary)
  );

  const lines = [
    `${emojiString(client, tradeEmoji.thread, '🧵')} **Trade Thread Active**`,
    '',
    `${env.emojis.trade.user} **Owner:** <@${match.owner_user_id}>`,
    `${emojiString(client, tradeEmoji.accept, '🤝')} **Accepter:** <@${match.accepter_user_id}>`,
    '',
    `${env.emojis.trade.item} **Owner Offer:** ${trade.trading_item}`,
    `${env.emojis.trade.looking} **Requested:** ${trade.looking_for}`,
    '',
    trade.settings?.middlemanRequired
      ? `${emojiString(client, tradeEmoji.middleman, '🛡️')} **Middleman:** Required for this deal`
      : `${emojiString(client, tradeEmoji.middleman, '🛡️')} **Middleman:** Optional, request one below if needed`,
    '',
    'Press **Confirm Trade** after the in-game trade is finished.',
    'Press **Cancel Trade** if the deal fails or is abandoned.'
  ];

  await thread.send({
    content: `${pingRole}${trade.settings?.middlemanRequired && middlemanRoleId ? `<@&${middlemanRoleId}> ` : ''}<@${match.owner_user_id}> <@${match.accepter_user_id}>`,
    allowedMentions: {
      users: [match.owner_user_id, match.accepter_user_id],
      roles: [env.tradeMatchRoleId, trade.settings?.middlemanRequired ? middlemanRoleId : ''].filter(Boolean)
    },
    embeds: [{
      title: 'Hyperions Trade Match',
      description: lines.join('\n'),
      color: 0x7c6fff,
      timestamp: new Date().toISOString()
    }],
    components: [confirmRow]
  });

  await updateTradeMatch(match.id, {
    discord_thread_id: thread.id,
    status: 'in_progress',
    updated_at: new Date().toISOString()
  }).catch(() => null);
  await updateTradePost(trade.id, {
    thread_id: thread.id,
    status: 'accepted',
    matched_by: match.accepter_user_id,
    matched_at: new Date().toISOString()
  }).catch(() => null);

  return thread;
}

async function openTradeMatch(client, trade, accepterUserId, options = {}) {
  const existing = await findOpenTradeMatch(trade.id, accepterUserId).catch(() => null);
  let match = existing;
  if (!match) {
    match = await createTradeMatch({
      trade_post_id: trade.id,
      guild_id: trade.guild_id,
      owner_user_id: trade.user_id,
      accepter_user_id: accepterUserId,
      game_key: trade.game_key,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      owner_items: parseTradeItems(trade.trading_item),
      accepter_items: Array.isArray(options.accepterItems) ? options.accepterItems : parseTradeItems(options.note || ''),
      note: options.note || null
    });
  }

  let threadId = match.discord_thread_id || trade.thread_id || null;
  if (!threadId) {
    const thread = await createTradeThreadForMatch(client, trade, match);
    threadId = thread.id;
  }

  return { match: await getTradeMatchById(match.id), threadId };
}

async function resolveTradeCompletion(client, matchId, actingUserId, nextStatus) {
  const match = await getTradeMatchById(matchId);
  if (!match) throw new Error('Trade match not found');

  await upsertTradeConfirmation(matchId, actingUserId, nextStatus);
  const confirmations = await getTradeConfirmations(matchId);
  const statuses = new Map(confirmations.map((entry) => [entry.user_id, entry.status]));
  const ownerStatus = statuses.get(match.owner_user_id);
  const accepterStatus = statuses.get(match.accepter_user_id);

  if (nextStatus === 'cancelled' || ownerStatus === 'cancelled' || accepterStatus === 'cancelled') {
    await updateTradeMatch(matchId, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await updateTradePost(match.trade_post_id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString()
    }).catch(() => null);
    return { status: 'cancelled', match };
  }

  if (ownerStatus === 'confirmed' && accepterStatus === 'confirmed') {
    await updateTradeMatch(matchId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await updateTradePost(match.trade_post_id, {
      status: 'completed',
      completed_at: new Date().toISOString()
    }).catch(() => null);
    return { status: 'completed', match };
  }

  return { status: 'pending', match };
}

module.exports = {
  publishTradeToDiscord,
  openTradeMatch,
  resolveTradeCompletion,
  getTradeEmojiSet,
  emojiComponent,
  emojiString
};
