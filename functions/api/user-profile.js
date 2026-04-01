import { createClient } from '@supabase/supabase-js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase credentials missing' }, 500);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'Missing user ID' }, 400);

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const [vouchesRes, profileRes] = await Promise.all([
      supabase.from('vouches').select('*', { count: 'exact', head: true }).eq('helper_user_id', id),
      supabase
        .from('user_profiles')
        .select('is_verified, trust_score, reputation, username, avatar_url, verified_at')
        .eq('user_id', id)
        .maybeSingle()
    ]);

    if (vouchesRes.error) throw vouchesRes.error;
    if (profileRes.error && profileRes.error.code !== 'PGRST116') throw profileRes.error;

    const profile = profileRes.data;
    const score = profile?.reputation ?? vouchesRes.count ?? 0;

    let rank = 'Member';
    if (score > 100) rank = 'Elite';
    else if (score > 25) rank = 'Trusted';
    else if (score > 5) rank = 'Active';

    return json({
      id,
      username: profile?.username || null,
      avatarUrl: profile?.avatar_url || null,
      reputation: score,
      rank,
      trustScore: profile?.trust_score ?? Math.min(60 + score * 2, 99),
      isVerified: Boolean(profile?.is_verified || score > 5),
      verifiedAt: profile?.verified_at || null
    });
  } catch (error) {
    console.error('[functions/api/user-profile] failed', error);
    return json({ error: error.message }, 500);
  }
}
