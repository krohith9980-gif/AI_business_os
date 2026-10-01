const { Client } = require('./scratch/node_modules/pg');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const report = {};

  // Migration status
  const mig = await client.query(SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5);
  report.latest_migrations = mig.rows.map(r => r.version);

  // Function signatures
  const funcs = await client.query(
    SELECT pg_get_function_identity_arguments(p.oid) as sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
    WHERE p.proname = 'process_sale' AND n.nspname = 'public'
  );
  report.process_sale_signatures = funcs.rows.map(r => r.sig);

  // Check table store_invoice_sequences
  const seqTable = await client.query(SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_invoice_sequences') as exists);
  report.store_invoice_sequences_exists = seqTable.rows[0].exists;

  // Check sales.invoice_number
  const invNum = await client.query(SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'invoice_number') as exists);
  report.sales_invoice_number_exists = invNum.rows[0].exists;

  // Check sale_items snapshot fields
  const pName = await client.query(SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'product_name') as exists);
  report.sale_items_product_name_exists = pName.rows[0].exists;

  const skuCol = await client.query(SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'sku') as exists);
  report.sale_items_sku_exists = skuCol.rows[0].exists;

  // Check unique constraint uq_sales_store_invoice
  const uqConst = await client.query(SELECT EXISTS (SELECT FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'sales' AND constraint_name = 'uq_sales_store_invoice') as exists);
  report.unique_constraint_exists = uqConst.rows[0].exists;

  // Check privileges
  const privs = await client.query(
    SELECT grantee, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_schema = 'public' AND table_name = 'store_invoice_sequences'
  );
  report.sequence_table_privileges = privs.rows;

  console.log(JSON.stringify(report, null, 2));
  await client.end();
}

run().catch(console.error);
