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
