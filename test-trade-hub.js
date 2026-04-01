require('dotenv').config();

const req = {
  url: '/api/trade-hub',
  headers: {}
};
const res = {
  setHeader: (k, v) => console.log(`SET HEADER ${k}: ${v}`),
  status: function(code) {
    console.log(`STATUS CODE ${code}`);
    return this;
  },
  json: function(data) {
    console.log('JSON RESPONSE:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
    return this;
  },
  writeHead: function(code, headers) {
    console.log(`WRITE HEAD ${code}`, headers);
  },
  end: function(data) {
    console.log('END RESPONSE:', data.slice(0, 500) + '...');
  }
};

const handler = require('./api/trade-hub.js');
handler(req, res).then(() => console.log('Done')).catch(console.error);
