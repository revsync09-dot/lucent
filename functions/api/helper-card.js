export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  // Northflank is used for image generation because Cloudflare Workers don't support canvas logic.
  // The Northflank URL should be set in Cloudflare Variables as NORTHFLANK_URL.
  // Example: https://hyperions-bot-xxxxx.northflank.app
  const nfBase = env.NORTHFLANK_URL || 'https://hyperionsapplication.xyz'; 
  
  // If the Northflank URL is just the main domain, we assuming the bot is serving there too.
  // We'll redirect the browser to the Northflank service for the actual image.
  const target = new URL(`/api/helper-card`, nfBase);
  if (userId) target.searchParams.set('userId', userId);

  return Response.redirect(target.toString(), 302);
}
