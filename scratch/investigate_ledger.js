const { Client } = require('pg');
async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  console.log("--- FETCHING RECENT PURCHASE LEDGER ENTRIES ---");
  const ledgerRes = await client.query(`
    SELECT id, transaction_type, reference_id, amount, notes, supplier_id, created_at 
    FROM supplier_ledger 
    WHERE transaction_type = 'PURCHASE'
    ORDER BY created_at DESC 
    LIMIT 20
  `);
  
  for (const row of ledgerRes.rows) {
    console.log(`\nLedger Row ID: ${row.id}`);
    console.log(`Amount: ${row.amount}`);
    console.log(`Notes: ${row.notes}`);
    console.log(`Supplier ID: ${row.supplier_id}`);
    console.log(`Reference ID: ${row.reference_id}`);

    if (row.reference_id) {
      const poCheck = await client.query('SELECT id FROM purchase_orders WHERE id = $1', [row.reference_id]);
      if (poCheck.rows.length > 0) {
        console.log(` -> FOUND in purchase_orders: ${JSON.stringify(poCheck.rows[0])}`);
      } else {
        console.log(` -> NOT in purchase_orders`);
      }

      const receiptCheck = await client.query('SELECT id FROM purchase_receipts WHERE id = $1', [row.reference_id]).catch(() => ({rows:[]}));
      if (receiptCheck.rows.length > 0) {
        console.log(` -> FOUND in purchase_receipts: ${JSON.stringify(receiptCheck.rows[0])}`);
      } else {
        console.log(` -> NOT in purchase_receipts`);
      }
      
      const invoiceCheck = await client.query('SELECT id FROM invoices WHERE id = $1', [row.reference_id]).catch(() => ({rows:[]}));
      if (invoiceCheck.rows.length > 0) {
        console.log(` -> FOUND in invoices: ${JSON.stringify(invoiceCheck.rows[0])}`);
      } else {
        console.log(` -> NOT in invoices`);
      }
    }
  }

  await client.end();
}
run().catch(console.error);
