require('dotenv').config();

const gameMap = {
  ALS: { label: 'Anime Last Stand (ALS)', emoji: 'ALS' },
  AG: { label: 'Anime Guardians (AG)', emoji: 'AG' },
  AC: { label: 'Anime Crusaders (AC)', emoji: 'AC' },
  UTD: { label: 'Universal Tower Defense (UTD)', emoji: 'UTD' },
  AV: { label: 'Anime Vanguards (AV)', emoji: 'AV' },
  BL: { label: 'Bizarre Lineage (BL)', emoji: 'BL' },
  SP: { label: 'Sailor Piece (SP)', emoji: 'SP' },
  ARX: { label: 'Anime Rangers X (ARX)', emoji: 'ARX' },
  ASTD: { label: 'All Star Tower Defense (ASTD)', emoji: 'ASTD' },
  APX: { label: 'Anime Paradox (APX)', emoji: 'APX' }
};
const GAME_ALIASES = {
  ALS: 'ALS',
  ANIMELASTSTAND: 'ALS',
  AG: 'AG',
  ANIMEGUARDIANS: 'AG',
  AC: 'AC',
  ANIMECRUSADERS: 'AC',
  UTD: 'UTD',
  UNIVERSALTOWERDEFENSE: 'UTD',
  AV: 'AV',
  ANIMEVANGUARDS: 'AV',
  BL: 'BL',
  BIZARRELINEAGE: 'BL',
  SP: 'SP',
  SAILORPIECE: 'SP',
  ARX: 'ARX',
  ANIMERANGERSX: 'ARX',
  ASTD: 'ASTD',
  ATSD: 'ASTD',
  ALLSTARTOWERDEFENSE: 'ASTD',
  APX: 'APX',
  ANIMEPARADOX: 'APX'
};
const HELPER_RANK_TIERS = [
  { min: 100, label: 'Meister' },
  { min: 50, label: 'Experte' },
  { min: 30, label: 'Senior Helper' },
  { min: 15, label: 'Helper' },
  { min: 5, label: 'Junior Helper' },
  { min: 0, label: 'Noob Helper' }
];
function getHelperRank(totalVouches) {
  const total = Number(totalVouches) || 0;
  for (const tier of HELPER_RANK_TIERS) {
    if (total >= tier.min) return tier.label;
  }
  return 'Noob Helper';
}
function normalizeGameKey(value, fallback = '') {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (gameMap[raw]) return raw;
  const compressed = raw.replace(/[^A-Z0-9]/g, '');
  return GAME_ALIASES[compressed] || raw || fallback;
}
function getGameLabel(value, fallback = '') {
  const key = normalizeGameKey(value, fallback);
  return gameMap[key]?.label || String(value || fallback || key || '').trim();
}
function normalizeEmojiName(value, fallback = 'e') {
  const raw = String(value || '').trim();
  const withoutColons = raw.replace(/^:+|:+$/g, '');
  const cleaned = withoutColons.replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || fallback;
}
function emojiEntry(idKey, nameKey, defaultName, idKeyFallback, nameKeyFallback, defaultId = '') {
  const id = process.env[idKey] || (idKeyFallback ? process.env[idKeyFallback] : '') || defaultId || '';
  const name = normalizeEmojiName(
    process.env[nameKey] || (nameKeyFallback ? process.env[nameKeyFallback] : '') || defaultName || 'e',
    defaultName || 'e'
  );
  return { id, name };
}
const env = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  minMessagesForTicket: Number(process.env.MIN_MESSAGES_FOR_TICKET || 30),
  staffRoleId: process.env.CARRY_STAFF_ROLE_ID,
  topHelperRoleId: process.env.TOP_HELPER_ROLE_ID,
  boosterRoleId: process.env.BOOSTER_ROLE_ID,
  logChannelId: process.env.LOG_CHANNEL_ID,
  vouchChannelId: process.env.VOUCH_CHANNEL_ID,
  transcriptChannelId: process.env.TRANSCRIPT_CHANNEL_ID,
  tradeChannelId: process.env.TRADE_CHANNEL_ID || process.env.VOUCH_CHANNEL_ID,
  verifiedTraderRoleId: process.env.VERIFIED_TRADER_ROLE_ID || '1483161671014023410',
  tradeMatchRoleId: process.env.TRADE_MATCH_ROLE_ID || process.env.TRADE_MOD_ROLE_ID || '',
  helperApplicationUrl: process.env.HELPER_APPLICATION_URL || '',
  helperApplicationChannelId: process.env.HELPER_APPLICATION_CHANNEL_ID || process.env.LOG_CHANNEL_ID,
  defaultTicketCategoryId: process.env.DEFAULT_TICKET_CATEGORY_ID,
  ticketCategories: {
    ALS: process.env.TICKET_CATEGORY_ALS_ID || process.env.TICKET_CATEGORY_RAIDS_ID,
    AG: process.env.TICKET_CATEGORY_AG_ID || process.env.TICKET_CATEGORY_RACEV4_ID,
    AC: process.env.TICKET_CATEGORY_AC_ID || process.env.TICKET_CATEGORY_LEVI_ID,
    UTD: process.env.TICKET_CATEGORY_UTD_ID || process.env.TICKET_CATEGORY_AWAKEN_ID,
    AV: process.env.TICKET_CATEGORY_AV_ID,
    BL: process.env.TICKET_CATEGORY_BL_ID,
    SP: process.env.TICKET_CATEGORY_SP_ID,
    ASTD: process.env.TICKET_CATEGORY_ASTD_ID || '1483552274167890182',
    ARX: process.env.TICKET_CATEGORY_ARX_ID,
    APX: process.env.TICKET_CATEGORY_APX_ID
  },
  helperRoles: {
    ALS: process.env.HELPER_ROLE_ALS_ID || process.env.HELPER_ROLE_RAIDS_ID,
    AG: process.env.HELPER_ROLE_AG_ID || process.env.HELPER_ROLE_RACEV4_ID,
    AC: process.env.HELPER_ROLE_AC_ID || process.env.HELPER_ROLE_LEVI_ID,
    UTD: process.env.HELPER_ROLE_UTD_ID || process.env.HELPER_ROLE_AWAKEN_ID,
    AV: process.env.HELPER_ROLE_AV_ID,
    BL: process.env.HELPER_ROLE_BL_ID,
    SP: process.env.HELPER_ROLE_SP_ID || process.env.HELPER_ROLE_AP_ID,
    ASTD: process.env.HELPER_ROLE_ASTD_ID || '1483551983993487370',
    ARX: process.env.HELPER_ROLE_ARX_ID,
    APX: process.env.HELPER_ROLE_APX_ID
  },
  emojis: {
    title: emojiEntry('EMOJI_TITLE_ID', 'EMOJI_TITLE_NAME', 'icon2'),
    bullet: process.env.EMOJI_BULLET_ID || '',
    success: process.env.EMOJI_SUCCESS_ID || '',
    error: process.env.EMOJI_ERROR_ID || '',
    warning: process.env.EMOJI_WARNING_ID || '',
    info: process.env.EMOJI_INFO_ID || '',
    log: process.env.EMOJI_LOG_ID || '',
    ticketClaim: emojiEntry('EMOJI_TICKET_CLAIM_ID', 'EMOJI_TICKET_CLAIM_NAME', 'ticket_claim'),
    ticketUnclaim: emojiEntry('EMOJI_TICKET_UNCLAIM_ID', 'EMOJI_TICKET_UNCLAIM_NAME', 'ticket_unclaim'),
    ticketVouch: emojiEntry('EMOJI_TICKET_VOUCH_ID', 'EMOJI_TICKET_VOUCH_NAME', 'ticket_vouch'),
    ticketClose: emojiEntry('EMOJI_TICKET_CLOSE_ID', 'EMOJI_TICKET_CLOSE_NAME', 'ticket_close'),
    ticketRemind: emojiEntry('EMOJI_TICKET_REMIND_ID', 'EMOJI_TICKET_REMIND_NAME', 'ticket_remind'),
    ticketComplete: emojiEntry('EMOJI_TICKET_COMPLETE_ID', 'EMOJI_TICKET_COMPLETE_NAME', 'ticket_complete'),
    welcomeFree: emojiEntry('EMOJI_WELCOME_FREE_ID', 'EMOJI_WELCOME_FREE_NAME', 'free'),
    welcomeBooster: emojiEntry('EMOJI_WELCOME_BOOSTER_ID', 'EMOJI_WELCOME_BOOSTER_NAME', 'booster'),
    welcomeQuick: emojiEntry('EMOJI_WELCOME_QUICK_ID', 'EMOJI_WELCOME_QUICK_NAME', 'quick'),
    welcomeSupportedGames: emojiEntry('EMOJI_WELCOME_SUPPORTED_GAMES_ID', 'EMOJI_WELCOME_SUPPORTED_GAMES_NAME', 'games'),
    carryEntry: emojiEntry('EMOJI_CARRY_ENTRY_ID', 'EMOJI_CARRY_ENTRY_NAME', 'Carry', '', '', '1480990528937132247'),
    becomeHelperEntry: emojiEntry('EMOJI_BECOME_HELPER_ENTRY_ID', 'EMOJI_BECOME_HELPER_ENTRY_NAME', 'helper', '', '', '1480990487057010833'),
    serviceAls: emojiEntry('EMOJI_SERVICE_ALS_ID', 'EMOJI_SERVICE_ALS_NAME', 'ALS', 'EMOJI_SERVICE_RAIDS_ID', 'EMOJI_SERVICE_RAIDS_NAME'),
    serviceAg: emojiEntry('EMOJI_SERVICE_AG_ID', 'EMOJI_SERVICE_AG_NAME', 'AG', 'EMOJI_SERVICE_RACEV4_ID', 'EMOJI_SERVICE_RACEV4_NAME'),
    serviceAc: emojiEntry('EMOJI_SERVICE_AC_ID', 'EMOJI_SERVICE_AC_NAME', 'AC', 'EMOJI_SERVICE_LEVI_ID', 'EMOJI_SERVICE_LEVI_NAME'),
    serviceUtd: emojiEntry('EMOJI_SERVICE_UTD_ID', 'EMOJI_SERVICE_UTD_NAME', 'UTD'),
    serviceAv: emojiEntry('EMOJI_SERVICE_AV_ID', 'EMOJI_SERVICE_AV_NAME', 'AV'),
    serviceBl: emojiEntry('EMOJI_SERVICE_BL_ID', 'EMOJI_SERVICE_BL_NAME', 'BL'),
    serviceSp: emojiEntry('EMOJI_SERVICE_SP_ID', 'EMOJI_SERVICE_SP_NAME', 'Sailor_Piece', 'EMOJI_SERVICE_AP_ID', 'EMOJI_SERVICE_AP_NAME', '1480990084109959259'),
    serviceAstd: emojiEntry('EMOJI_SERVICE_ASTD_ID', 'EMOJI_SERVICE_ASTD_NAME', 'ASTD'),
    serviceArx: emojiEntry('EMOJI_SERVICE_ARX_ID', 'EMOJI_SERVICE_ARX_NAME', 'ARX', 'EMOJI_SERVICE_ARX', 'EMOJI_SERVICE_ARX_LABEL'),
    serviceApx: emojiEntry('EMOJI_SERVICE_APX_ID', 'EMOJI_SERVICE_APX_NAME', 'APX'),
    goal: emojiEntry('EMOJI_GOAL_ID', 'EMOJI_GOAL_NAME', 'goal'),
    gamemode: emojiEntry('EMOJI_GAMEMODE_ID', 'EMOJI_GAMEMODE_NAME', 'swords'),
    joinMethod: emojiEntry('EMOJI_JOIN_METHOD_ID', 'EMOJI_JOIN_METHOD_NAME', 'handshake'),
    handshake: emojiEntry('EMOJI_HANDSHAKE_ID', 'EMOJI_HANDSHAKE_NAME', 'handshake'),
    castle: emojiEntry('EMOJI_CASTLE_ID', 'EMOJI_CASTLE_NAME', 'castle'),
    swords: emojiEntry('EMOJI_SWORDS_ID', 'EMOJI_SWORDS_NAME', 'swords'),
    link: emojiEntry('EMOJI_LINK_ID', 'EMOJI_LINK_NAME', 'link'),
    plus: emojiEntry('EMOJI_PLUS_ID', 'EMOJI_PLUS_NAME', 'plus'),
    joinMethodBanner: process.env.JOIN_METHOD_IMAGE_URL || 'https://i.imgur.com/vHUPWj3.png',
    modmail: {
      staff: process.env.EMOJI_MODMAIL_STAFF_ID || '',
      chat: process.env.EMOJI_MODMAIL_CHAT_ID || '',
      accepted: process.env.EMOJI_MODMAIL_ACCEPTED_ID || '',
      user: process.env.EMOJI_MODMAIL_USER_ID || ''
    },
    website: {
      uptime: process.env.EMOJI_WEBSITE_UPTIME_ID || '1479399220082638908',
      ping: process.env.EMOJI_WEBSITE_PING_ID || '1478167590797971617',
      tickets: process.env.EMOJI_WEBSITE_TICKETS_ID || '1478167722566352978',
      vouches: process.env.EMOJI_WEBSITE_VOUCHES_ID || '1479386745870221486',
      rules: emojiEntry('EMOJI_WEBSITE_RULES_ID', 'EMOJI_WEBSITE_RULES_NAME', 'rules'),
      payment: emojiEntry('EMOJI_WEBSITE_PAYMENT_ID', 'EMOJI_WEBSITE_PAYMENT_NAME', 'payment'),
      quota: emojiEntry('EMOJI_WEBSITE_QUOTA_ID', 'EMOJI_WEBSITE_QUOTA_NAME', 'quota'),
      info: emojiEntry('EMOJI_WEBSITE_INFO_ID', 'EMOJI_WEBSITE_INFO_NAME', 'info'),
      n01: process.env.EMOJI_WEBSITE_NUMBER_01_ID || '01',
      n02: process.env.EMOJI_WEBSITE_NUMBER_02_ID || '02',
      n03: process.env.EMOJI_WEBSITE_NUMBER_03_ID || '03',
      shield: emojiEntry('EMOJI_WEBSITE_SHIELD_ID', 'EMOJI_WEBSITE_SHIELD_NAME', 'shield')
    },
    trade: {
      header: emojiEntry('EMOJI_TRADE_HEADER_ID', 'EMOJI_TRADE_HEADER_NAME', 'trade_hub'),
      featureFree: emojiEntry('EMOJI_TRADE_FEATURE_FREE_ID', 'EMOJI_TRADE_FEATURE_FREE_NAME', 'trade_free'),
      featureSecure: emojiEntry('EMOJI_TRADE_FEATURE_SECURE_ID', 'EMOJI_TRADE_FEATURE_SECURE_NAME', 'trade_secure'),
      featureQuick: emojiEntry('EMOJI_TRADE_FEATURE_QUICK_ID', 'EMOJI_TRADE_FEATURE_QUICK_NAME', 'trade_quick'),
      featureSupported: emojiEntry('EMOJI_TRADE_FEATURE_SUPPORTED_ID', 'EMOJI_TRADE_FEATURE_SUPPORTED_NAME', 'trade_supported'),
      item: emojiEntry('EMOJI_TRADE_ITEM_ID', 'EMOJI_TRADE_ITEM_NAME', 'trade_item'),
      looking: emojiEntry('EMOJI_TRADE_LOOKING_ID', 'EMOJI_TRADE_LOOKING_NAME', 'trade_looking'),
      user: emojiEntry('EMOJI_TRADE_USER_ID', 'EMOJI_TRADE_USER_NAME', 'trade_user'),
      time: emojiEntry('EMOJI_TRADE_TIME_ID', 'EMOJI_TRADE_TIME_NAME', 'trade_time'),
      success: emojiEntry('EMOJI_TRADE_SUCCESS_ID', 'EMOJI_TRADE_SUCCESS_NAME', 'trade_success')
    }
  },
  modmailChannelId: process.env.MODMAIL_CHANNEL_ID,
  modmailInitialMessage: process.env.MODMAIL_INITIAL_MESSAGE || "Welcome! Send a message and our staff will respond shortly.",
  modmailStickyMessage: process.env.MODMAIL_STICKY_MESSAGE || ""
};
function missingEnvKeys() {
  return Object.entries({
    DISCORD_TOKEN: env.token,
    DISCORD_CLIENT_ID: env.clientId,
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: env.supabaseKey
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
module.exports = {
  env,
  gameMap,
  missingEnvKeys,
  getHelperRank,
  normalizeGameKey,
  getGameLabel
};
