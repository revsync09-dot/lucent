const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkData() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  console.log('--- Database Check ---');
  
  const tables = ['server_messages', 'vc_sessions', 'guild_growth'];
  
  for (const table of tables) {
    const { data, count, error } = await supabase
      .from(table)
      .select('guild_id', { count: 'exact', head: false })
      .limit(5);
      
    if (error) {
      console.error(`Error checking ${table}:`, error.message);
    } else {
      console.log(`Table ${table}: ${count} rows`);
      if (data && data.length > 0) {
        console.log(`Sample guild_ids:`, [...new Set(data.map(d => d.guild_id))]);
      }
    }
  }
}

checkData();
