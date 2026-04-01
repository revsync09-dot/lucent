module.exports = async (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `${(process.env.PUBLIC_BASE_URL || 'https://hyperionsapplication.xyz').replace(/\/$/, '')}/api/callback`,
    response_type: 'code',
    scope: 'identify'
  });
  return res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
};