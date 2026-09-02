import fs from 'fs';
import path from 'path';

// Parse .env.test manually since we don't want to rely on dotenv in ES modules
const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.test'), 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, ...rest] = line.replace(/\r/g, '').split('=');
  if (key && rest.length > 0) acc[key.trim()] = rest.join('=').trim();
  return acc;
}, {});

export const PROD_URL = 'lhtibverxjpcvmajzazv';
export const TEST_URL = 'wtzyngynxxnncgnniyym';
export const PROD_ORG_ID = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';

export const IS_TEST_ENV = env.TEST_ENV === 'true';
export const SUPABASE_URL = env.TEST_SUPABASE_URL || '';
export const SUPABASE_KEY = env.TEST_SUPABASE_SERVICE_KEY || '';
export const ORG_ID = env.TEST_ORG_ID || '';

if (!IS_TEST_ENV) {
  console.error('E2E GUARD: TEST_ENV=true is strictly required.');
  process.exit(1);
}
if (!SUPABASE_URL.includes(TEST_URL)) {
  console.error('E2E GUARD: URL must target the staging project wtzyngynxxnncgnniyym.');
  process.exit(1);
}
if (SUPABASE_URL.includes(PROD_URL)) {
  console.error('E2E GUARD: ABORT! PRODUCTION URL DETECTED.');
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error('E2E GUARD: TEST_SUPABASE_SERVICE_KEY is missing.');
  process.exit(1);
}
if (!ORG_ID) {
  console.error('E2E GUARD: TEST_ORG_ID is missing.');
  process.exit(1);
}
if (ORG_ID === PROD_ORG_ID) {
  console.error('E2E GUARD: ABORT! PRODUCTION ORG ID DETECTED.');
  process.exit(1);
}

// Ensure process.env has these for scripts that expect it directly
process.env.TEST_ORG_ID = ORG_ID;
process.env.TEST_ENV = 'true';