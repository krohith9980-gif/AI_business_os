import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8')

const env = {}
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    env[match[1].trim()] = match[2].trim()
  }
})

const url = env['NEXT_PUBLIC_SUPABASE_URL']
const key = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

if (!url || !key || url.includes('YOUR_SUPABASE_URL')) {
  console.error("Error: Missing or placeholder Supabase credentials in .env.local")
  process.exit(1)
}


  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID_G = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID_G = process.env.TEST_ORG_ID;
  const IS_TEST_ENV_G = process.env.TEST_ENV === 'true';
  const URL_G = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!IS_TEST_ENV_G) { console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.'); process.exit(1); }
  if (!TEST_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.'); process.exit(1); }
  if (TEST_ORG_ID_G === PROD_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.'); process.exit(1); }
  if (URL_G.includes('lhtibverxjpcvmajzazv')) { console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected.'); process.exit(1); }

const supabase = createClient(url, key)

async function testConnection() {
  console.log('Testing connection to:', url)
  const { error } = await supabase.auth.getSession()
  
  if (error) {
    console.error("Connection Failed:", error.message)
    process.exit(1)
  }
  
  console.log("Successfully connected to Supabase Auth API!")
  process.exit(0)
}

testConnection()
