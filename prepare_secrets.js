const fs = require('fs');
const { execSync } = require('child_process');

const content = fs.readFileSync('.env', 'utf8');
const lines = content.split('\n');
const secrets = {};

lines.forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const firstEq = line.indexOf('=');
    if (firstEq === -1) return;
    const key = line.substring(0, firstEq).trim();
    let value = line.substring(firstEq + 1).trim();
    
    // Remote optional quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
    }
    
    if (key && value) {
        secrets[key] = value;
    }
});

fs.writeFileSync('secrets.json', JSON.stringify(secrets, null, 2));
console.log('Created secrets.json with ' + Object.keys(secrets).length + ' keys.');
