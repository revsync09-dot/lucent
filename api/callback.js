const { createClient } = require('@supabase/supabase-js');

const VERIFIED_ROLE_ID = '1483161671014023410';

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || 'https://hyperionsapplication.xyz').replace(/\/$/, '');
}

function resolveAvatarUrl(user) {
  if (user?.id && user?.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const index = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function discordApi(path, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('Missing DISCORD_TOKEN');
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
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

async function upsertVerifiedProfile(user) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from('user_profiles').upsert({
    user_id: String(user.id),
    username: user.username,
    avatar_url: resolveAvatarUrl(user),
    is_verified: true,
    verified_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function addVerifiedRole(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !userId) return;
  await discordApi(`/guilds/${guildId}/members/${userId}/roles/${VERIFIED_ROLE_ID}`, { method: 'PUT' });
}

async function sendTradeAccessDm(user) {
  const dmRes = await discordApi('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: user.id })
  });
  const dmChannel = await dmRes.json();
  const base = baseUrl();
  await discordApi(`/channels/${dmChannel.id}/messages`, {
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

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${baseUrl()}/api/callback`;

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
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

    await upsertVerifiedProfile(user).catch((err) => {
      console.error('[OAuth] Profile Sync Failed:', err.message);
    });
    await addVerifiedRole(user.id).catch((err) => {
      console.error('[OAuth] Role Assign Failed:', err.message);
    });
    await sendTradeAccessDm(user).catch((err) => {
      console.error('[OAuth] Trade Access DM Failed:', err.message);
    });

    const userData = JSON.stringify({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      discriminator: user.discriminator || '0'
    });
    const cookieValue = encodeURIComponent(userData);
    const cookieHeader = `discord_user=${cookieValue}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
    res.setHeader('Set-Cookie', cookieHeader);

    const finalUrl = `${baseUrl()}/verify`;
    console.log(`[OAuth] Success for ${user.username}, redirecting to ${finalUrl}`);
    return res.redirect(finalUrl);
  } catch (err) {
    console.error('[OAuth] Callback Error:', err.message);
    return res.status(500).send(`Authentication failed: ${err.message}`);
  }
};
