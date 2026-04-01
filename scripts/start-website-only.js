
require('dotenv').config();
const { startStatusServer } = require('../src/lib/status-server');
const { env } = require('../src/config');

console.log('--- HYPERIONS WEBSITE ONLY MODE ---');
console.log('Starting status server on port 3000...');
console.log('Bot client is NOT initialized (Standalone mode)');

const port = process.env.PORT || 3000;
startStatusServer(port);

console.log(`Server is live at http://localhost:${port}`);
console.log('Press Ctrl+C to stop.');
