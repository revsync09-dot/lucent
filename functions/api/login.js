export async function onRequest(context) {
  const { env } = context;
  const baseUrl = String(env.PUBLIC_BASE_URL || 'https://hyperionsapplication.xyz').replace(/\/$/, '');
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${baseUrl}/api/callback`,
    response_type: 'code',
    scope: 'identify',
    prompt: 'none'
  });
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://discord.com/api/oauth2/authorize?${params.toString()}`
    }
  });
}
