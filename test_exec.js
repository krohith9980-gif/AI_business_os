const { execSync } = require('child_process');
const sql = "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_invoice_sequences')";
try {
  const out = execSync(
px supabase db query "" --linked).toString();
  console.log('RAW_OUT:', out);
} catch (e) {
  console.log('ERR:', e.message);
}
