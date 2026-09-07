const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const keyMatch = content.match(/^GEMINI_API_KEY=(.+)$/m);
if (!keyMatch) { console.error('Key not found'); process.exit(1); }
const key = keyMatch[1].trim();

const { execSync } = require('child_process');
try {
  execSync('npx vercel env add GEMINI_API_KEY preview --value "' + key + '" --yes', {
    encoding: 'utf8',
    stdio: 'inherit'
  });
  console.log('Successfully added to preview');
} catch (e) {
  console.error('Error adding env var:', e.message);
}
