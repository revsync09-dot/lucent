const { verifyUserProfile, getUserProfile } = require('../../src/lib/supabase');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = JSON.parse(req.body);
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // 1. Update database status
    await verifyUserProfile(userId);

    // 2. Fetch profile to ensure it works
    const profile = await getUserProfile(userId);

    return res.status(200).json({
      success: true,
      profile: {
        isVerified: profile.is_verified,
        trustScore: profile.trust_score,
        reputation: profile.reputation
      }
    });
  } catch (error) {
    console.error('[api/verify] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
