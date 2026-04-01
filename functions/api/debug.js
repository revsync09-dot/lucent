export async function onRequest(context) {
  const { env } = context;
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    deployment: "Cloudflare Pages Functions",
    checks: {
      SUPABASE_URL: !!env.SUPABASE_URL ? "✅ FOUND" : "❌ MISSING",
      SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY ? "✅ FOUND" : "❌ MISSING",
      DISCORD_TOKEN: !!env.DISCORD_TOKEN ? "✅ FOUND" : "❌ MISSING",
      DISCORD_GUILD_ID: !!env.DISCORD_GUILD_ID ? "✅ FOUND" : "❌ MISSING",
      NORTHFLANK_URL: !!env.NORTHFLANK_URL ? "✅ FOUND" : "❌ MISSING"
    },
    rawKeysPresent: Object.keys(env)
  };

  return new Response(JSON.stringify(debugInfo, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}
