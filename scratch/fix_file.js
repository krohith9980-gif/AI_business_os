const fs = require('fs');
let content = fs.readFileSync('web/src/app/api/intelligence/scan-product/route.ts', 'utf8');
content = content.replace(/\\\`/g, '`');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync('web/src/app/api/intelligence/scan-product/route.ts', content);
