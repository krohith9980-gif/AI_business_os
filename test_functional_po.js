const { Client } = require('./scratch/node_modules/pg');

const crypto = require('crypto');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const org_id = "332f3e09-1c4d-4c15-960a-1ab211177235";
  const user_id = "62523573-58d2-4ce0-a640-f1593d6f67f0";
  const store_id = "09394761-4f48-4865-a9fe-e3e04c53a381";
  const supplier_id = "661701c6-777f-470a-8761-41c16638474c";
  const variant_id = "5b0b84e7-73af-491d-ba85-f0db4bd7c227";

  const po_idempotency_key = crypto.randomUUID();
  const receipt_idempotency_key = crypto.randomUUID();
  let test_po_id;
  let test_po_item_id;

  const report = {};

  try {
    // PRE-TEST STATE
    await client.query("BEGIN; set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    const pre_inv = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
    const pre_stock = pre_inv.rows.length > 0 ? pre_inv.rows[0].on_hand_stock : 0;

    const pre_sup = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
    const pre_balance = pre_sup.rows[0].outstanding_balance || 0;

    // ---------------------------------------------------------
    // TEST 1 — Create Manual PO
    // ---------------------------------------------------------
    const items = JSON.stringify([{
      variant_id: variant_id,
      quantity: 10,
      purchase_cost: 15.50
    }]);

    const res1 = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as po_id`, [store_id, supplier_id, po_idempotency_key, items]);
    test_po_id = res1.rows[0].po_id;
    report.TEST1_PO_ID = test_po_id;

    // Verify PO state
    const poState = await client.query('SELECT status FROM public.purchase_orders WHERE id = $1', [test_po_id]);
    report.TEST1_PO_STATUS = poState.rows[0].status;

    const poItems = await client.query('SELECT id, quantity_ordered, quantity_received FROM public.po_items WHERE po_id = $1', [test_po_id]);
    test_po_item_id = poItems.rows[0].id;
    report.TEST1_QTY_ORDERED = poItems.rows[0].quantity_ordered;
    report.TEST1_QTY_RECEIVED = poItems.rows[0].quantity_received;

    // Verify side effects
    const rcptCount = await client.query('SELECT count(*) FROM public.purchase_receipts WHERE po_id = $1', [test_po_id]);
    report.TEST1_RECEIPT_COUNT = rcptCount.rows[0].count;

    const post_inv1 = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
    const post_stock1 = post_inv1.rows.length > 0 ? post_inv1.rows[0].on_hand_stock : 0;
    report.TEST1_INVENTORY_UNCHANGED = (pre_stock === post_stock1);

    const post_sup1 = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
    const post_balance1 = post_sup1.rows[0].outstanding_balance || 0;
    report.TEST1_BALANCE_UNCHANGED = (pre_balance === post_balance1);

    const ledgerCount = await client.query("SELECT count(*) FROM public.supplier_ledger WHERE supplier_id = $1 AND transaction_type = 'PURCHASE' AND reference_id = $2", [supplier_id, test_po_id]);
    report.TEST1_LEDGER_ENTRY_COUNT = ledgerCount.rows[0].count;

    // ---------------------------------------------------------
    // TEST 2 — PO idempotency
    // ---------------------------------------------------------
    const res2 = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as po_id`, [store_id, supplier_id, po_idempotency_key, items]);
    report.TEST2_RETURNS_SAME_PO = (res2.rows[0].po_id === test_po_id);

    const duplicateCheck = await client.query('SELECT count(*) FROM public.purchase_orders WHERE idempotency_key = $1', [po_idempotency_key]);
    report.TEST2_NO_SECOND_PO = (duplicateCheck.rows[0].count === '1');

    const poItemCount = await client.query('SELECT count(*) FROM public.po_items WHERE po_id = $1', [test_po_id]);
    report.TEST2_NO_DUPLICATE_ITEMS = (poItemCount.rows[0].count === '1');

    // ---------------------------------------------------------
    // TEST 3 — Supplier confirmation
    // ---------------------------------------------------------
    await client.query(`SELECT public.record_supplier_response($1, 'SUPPLIER_CONFIRMED')`, [test_po_id]);
    
    const poState3 = await client.query('SELECT status FROM public.purchase_orders WHERE id = $1', [test_po_id]);
    report.TEST3_PO_STATUS = poState3.rows[0].status;

    const post_inv3 = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
    report.TEST3_INVENTORY_UNCHANGED = (pre_stock === (post_inv3.rows.length > 0 ? post_inv3.rows[0].on_hand_stock : 0));

    // ---------------------------------------------------------
    // TEST 4 — Partial goods receipt
    // ---------------------------------------------------------
    const receiptItems = JSON.stringify([{
      po_item_id: test_po_item_id,
      quantity_received: 4,
      batch_number: 'BATCH-TEST-1',
      mfg_date: '2026-09-01',
      expiry_date: '2027-09-01'
    }]);

    await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb)`, [test_po_id, receipt_idempotency_key, receiptItems]);

    const poState4 = await client.query('SELECT status FROM public.purchase_orders WHERE id = $1', [test_po_id]);
    report.TEST4_PO_STATUS = poState4.rows[0].status;

    const poItems4 = await client.query('SELECT quantity_received FROM public.po_items WHERE id = $1', [test_po_item_id]);
    report.TEST4_QTY_RECEIVED = poItems4.rows[0].quantity_received;

    const post_inv4 = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
    report.TEST4_INVENTORY_INCREASED = ((post_inv4.rows[0].on_hand_stock - post_stock1) === 4);

    const post_sup4 = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
    report.TEST4_BALANCE_INCREASED = (parseFloat(post_sup4.rows[0].outstanding_balance) - parseFloat(post_balance1) === 4 * 15.50);

    const rcptCount4 = await client.query('SELECT count(*) FROM public.purchase_receipts WHERE po_id = $1', [test_po_id]);
    report.TEST4_RECEIPT_COUNT = rcptCount4.rows[0].count;

    await client.query("ROLLBACK; /* Safe rollback of test data */");
  } catch (err) {
    report.ERROR = err.message;
    await client.query("ROLLBACK;");
  }

  console.log(JSON.stringify(report, null, 2));
  await client.end();
}

run().catch(console.error);
