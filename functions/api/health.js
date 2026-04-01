export async function onRequest(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    'Access-Control-Allow-Origin': '*'
  };
  
  return new Response(JSON.stringify({
    ok: true,
    service: 'hyperions-web-test',
    now: new Date().toISOString()
  }), { status: 200, headers });
}
