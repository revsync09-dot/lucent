async function test() {
  const r1 = await fetch('https://hyperionsapplication.xyz/api/status?t=5');
  const d1 = await r1.json();
  console.log('Status Version:', d1.version);
  console.log('Helper Presence:', d1.helperPresence);

  const r2 = await fetch('https://hyperionsapplication.xyz/api/trades-api');
  if(r2.headers.get('content-type').includes('json')) {
      const d2 = await r2.json();
      console.log('Trades API Success:', d2.success);
      console.log('Trades Count:', d2.trades.length);
  } else {
      console.log('Trades API Returned non-JSON:', await r2.text());
  }
}
test();
