const fs = require('fs');
const data = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));
console.log('OpenAPI Version:', data.openapi || data.swagger);
console.log('Tables:', Object.keys(data.components?.schemas || data.definitions || {}));
