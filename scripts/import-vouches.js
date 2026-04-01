require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultGuildId = process.env.DISCORD_GUILD_ID || '';

if (!supabaseUrl || !supabaseKey) {
  fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const inputArg = process.argv[2];
if (!inputArg) {
  fail('Usage: node scripts/import-vouches.js <path-to-json>');
}

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath)) {
  fail(`Input file not found: ${inputPath}`);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`Failed to parse JSON: ${error.message}`);
}

function normalizeString(value, fieldName, required = true) {
  const text = value == null ? '' : String(value).trim();
  if (required && !text) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return text;
}

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be an integer from 1 to 5');
  }
  return rating;
}

function normalizeDate(value, fallback = null) {
  if (!value) {
    if (fallback) return fallback;
    return new Date().toISOString();
  }

  const rawValue = String(value).trim();
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = rawValue.match(ddmmyyyy);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return new Date(`${yyyy}-${mm}-${dd}T12:00:00.000Z`).toISOString();
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid created_at date: ${value}`);
  }
  return date.toISOString();
}

function pickGuildId(entry) {
  return normalizeString(entry.guild_id || defaultGuildId, 'guild_id');
}

function buildLegacyUserId(helperId, fallbackSeed) {
  const seed = String(fallbackSeed || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unknown';
  return `legacy-user-${helperId}-${seed}`;
}

function normalizeVisibleVouch(entry, context = {}) {
  const helperId = normalizeString(entry.helper_user_id || context.helper_user_id, 'helper_user_id');
  const fallbackUserSeed =
    entry.customer_name ||
    entry.vouched_by ||
    entry.username ||
    entry.created_at ||
    entry.date ||
    Math.random().toString(36).slice(2, 10);

  return {
    guild_id: pickGuildId(entry),
    user_id:
      normalizeString(
        entry.user_id || entry.customer_id || entry.customer_user_id,
        'user_id',
        false
      ) || buildLegacyUserId(helperId, fallbackUserSeed),
    helper_user_id: helperId,
    game_key: normalizeString(entry.game_key || context.game_key || 'LEGACY', 'game_key').toUpperCase(),
    rating: normalizeRating(entry.rating),
    message: normalizeString(entry.message, 'message'),
    message_id: normalizeString(entry.message_id, 'message_id', false) || null,
    channel_id: normalizeString(entry.channel_id, 'channel_id', false) || null,
    created_at: normalizeDate(entry.created_at || entry.date)
  };
}

function buildSyntheticRows(summary) {
  const totalVouches = Number(summary.total_vouches);
  if (!Number.isInteger(totalVouches) || totalVouches < 0) {
    throw new Error('total_vouches must be a non-negative integer');
  }

  const visible = Array.isArray(summary.visible_vouches) ? summary.visible_vouches : [];
  const visibleRows = visible.map((entry) => normalizeVisibleVouch(entry, summary));

  if (visibleRows.length > totalVouches) {
    throw new Error('visible_vouches cannot be greater than total_vouches');
  }

  const missingCount = totalVouches - visibleRows.length;
  const helperId = normalizeString(summary.helper_user_id, 'helper_user_id');
  const guildId = pickGuildId(summary);
  const gameKey = normalizeString(summary.game_key || 'LEGACY', 'game_key').toUpperCase();
  const averageRating = Number(summary.average_rating || 5);
  const fallbackRating = Math.min(5, Math.max(1, Math.round(averageRating) || 5));
  const startDate = normalizeDate(summary.synthetic_start_date || '2026-01-01T12:00:00.000Z');
  const startMs = new Date(startDate).getTime();

  const syntheticRows = [];
  for (let index = 0; index < missingCount; index += 1) {
    const createdAt = new Date(startMs + index * 60 * 1000).toISOString();
    syntheticRows.push({
      guild_id: guildId,
      user_id: `legacy-user-${helperId}-${String(index + 1).padStart(3, '0')}`,
      helper_user_id: helperId,
      game_key: gameKey,
      rating: fallbackRating,
      message: summary.synthetic_message || 'Legacy restored vouch',
      message_id: null,
      channel_id: null,
      created_at: createdAt
    });
  }

  return [...visibleRows, ...syntheticRows];
}

function collectRows(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeVisibleVouch(entry));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Input JSON must be an array or an object with summaries/vouches.');
  }

  const rows = [];

  if (Array.isArray(payload.vouches)) {
    for (const entry of payload.vouches) {
      rows.push(normalizeVisibleVouch(entry));
    }
  }

  if (Array.isArray(payload.helper_summaries)) {
    for (const summary of payload.helper_summaries) {
      rows.push(...buildSyntheticRows(summary));
    }
  }

  return rows;
}

let rows;
try {
  rows = collectRows(raw);
} catch (error) {
  fail(`Invalid import payload: ${error.message}`);
}

if (!rows.length) {
  fail('No vouches to import.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function main() {
  const { error } = await supabase.from('vouches').insert(rows);
  if (error) {
    fail(`Supabase insert failed: ${error.message}`);
  }

  console.log(`Imported ${rows.length} vouches from ${inputPath}`);
}

main().catch((error) => {
  fail(`Unexpected error: ${error.message}`);
});