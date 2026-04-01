export async function onRequest(context) {
  const { env } = context;
  
  // Northflank is used for image generation because Cloudflare Workers don't support canvas logic.
  const nfBase = env.NORTHFLANK_URL || 'https://hyperionsapplication.xyz'; 
  
  const target = new URL(`/api/leaderboard-card`, nfBase);

  return Response.redirect(target.toString(), 302);
}
