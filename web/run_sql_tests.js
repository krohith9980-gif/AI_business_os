const fs = require('fs');
const { Client } = require('C:/Users/krohi/.gemini/antigravity-ide/brain/76b67af2-b33e-4c11-8fa6-ea14cc977ff6/scratch/node_modules/pg');

const envFile = fs.readFileSync('.env.test', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, ...rest] = line.replace(/\r/g, '').split('=');
  if (key) acc[key.trim()] = rest.join('=').trim();
  return acc;
}, {});

const sql = fs.readFileSync('../test_worker_security.sql', 'utf8');

async function run() {
  const client = new Client({ connectionString: env.TEST_DB_URL });
  await client.connect();

  // Set up NOTICE listener to see RAISE NOTICE logs
  client.on('notice', msg => console.log(msg.message));

  try {
    await client.query(sql);
    console.log('SQL executed successfully!');
  } catch (err) {
    console.error('SQL Error:', err);
  } finally {
    await client.end();
  }
}

run();
