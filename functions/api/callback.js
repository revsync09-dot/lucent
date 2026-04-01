import { createClient } from '@supabase/supabase-js';

const VERIFIED_ROLE_ID = '1483161671014023410';

function baseUrl(env) {
  return String(env.PUBLIC_BASE_URL || 'https://hyperionsapplication.xyz').replace(/\/$/, '');
}

function json(message, status = 200) {
  return new Response(message, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }
  });
}

function resolveAvatarUrl(user) {
  if (user?.id && user?.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const index = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function discordApi(env, path, options = {}) {
  if (!env.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status}: ${text || 'Unknown error'}`);
  }
  return response;
}

async function upsertVerifiedProfile(env, user) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from('user_profiles').upsert({
    user_id: String(user.id),
    username: user.username,
    avatar_url: resolveAvatarUrl(user),
    is_verified: true,
    verified_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function addVerifiedRole(env, userId) {
  if (!env.DISCORD_GUILD_ID || !userId) return;
  await discordApi(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${VERIFIED_ROLE_ID}`, {
    method: 'PUT'
  });
}

async function sendTradeAccessDm(env, user) {
  const dmRes = await discordApi(env, '/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: user.id })
  });
  const channel = await dmRes.json();
  const base = baseUrl(env);
  await discordApi(env, `/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: 5793266,
          components: [
            {
              type: 10,
                content: '## Trade System Coming Soon'
              },
              {
                type: 10,
                content: `You are now verified, ${user.username}. The Hyperions Trade System is currently being rebuilt.`
              },
              {
                type: 10,
                content: 'Trade features are temporarily unavailable while we finish the new system. Access will be opened again once the full release is ready.'
              },
            {
              type: 14,
              divider: true,
              spacing: 1
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: 'Trade Coming Soon',
                  url: `${base}/trade-hub`
                },
                {
                  type: 2,
                  style: 5,
                  label: 'Open Verify Page',
                  url: `${base}/verify`
                }
              ]
            }
          ]
        }
      ]
    })
  });
}

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) return json('No code provided', 400);

  const redirectUri = `${baseUrl(env)}/api/callback`;

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('[OAuth] Token Exchange Failed:', tokens);
      throw new Error(tokens.error_description || 'Token Error');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();
    if (!userRes.ok) {
      console.error('[OAuth] User Fetch Failed:', user);
      throw new Error(user.message || 'User Fetch Error');
    }

    await upsertVerifiedProfile(env, user).catch((error) => {
      console.error('[OAuth] Profile Sync Failed:', error.message);
    });
    await addVerifiedRole(env, user.id).catch((error) => {
      console.error('[OAuth] Role Assign Failed:', error.message);
    });
    await sendTradeAccessDm(env, user).catch((error) => {
      console.error('[OAuth] Trade Access DM Failed:', error.message);
    });

    const userData = encodeURIComponent(JSON.stringify({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      discriminator: user.discriminator || '0'
    }));
    const cookieHeader = `discord_user=${userData}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${baseUrl(env)}/verify`,
        'Set-Cookie': cookieHeader
      }
    });
  } catch (err) {
    console.error('[OAuth] Callback Error:', err.message);
    return json(`Authentication failed: ${err.message}`, 500);
  }
}
