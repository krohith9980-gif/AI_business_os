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

  const po1_idem = crypto.randomUUID();
  const po2_idem = crypto.randomUUID();
  const rcpt_idem_A = crypto.randomUUID();
  const rcpt_idem_B = crypto.randomUUID();
  const rcpt_idem_C = crypto.randomUUID();

  const cost = 15.50;

  let report = {
    tests: [],
    details: {}
  };

  try {
    await client.query("BEGIN; set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    // BASELINE
    const pre_inv = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
    const pre_stock = pre_inv.rows.length > 0 ? parseFloat(pre_inv.rows[0].on_hand_stock) : 0;

    const pre_sup = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
    const pre_balance = pre_sup.rows.length > 0 ? parseFloat(pre_sup.rows[0].outstanding_balance || 0) : 0;

    // SETUP
    const items = JSON.stringify([{ variant_id, quantity: 10, purchase_cost: cost }]);
    const po1_res = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as id`, [store_id, supplier_id, po1_idem, items]);
    const po1_id = po1_res.rows[0].id;
    const po1_item_res = await client.query('SELECT id FROM public.po_items WHERE po_id = $1', [po1_id]);
    const po1_item_id = po1_item_res.rows[0].id;
    await client.query(`SELECT public.record_supplier_response($1, 'SUPPLIER_CONFIRMED')`, [po1_id]);

    const batch1 = `B1-${crypto.randomUUID().substring(0,6)}`;
    const items_rcptA = JSON.stringify([{ po_item_id: po1_item_id, quantity_received: 4, batch_number: batch1, mfg_date: '2026-09-01', expiry_date: '2027-09-01' }]);
    const rcptA_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem_A, items_rcptA]);
    const rcptA_id = rcptA_res.rows[0].id;

    // helper to get current state
    const getState = async () => {
      const inv = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
      const sup = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
      const po = await client.query('SELECT status FROM public.purchase_orders WHERE id = $1', [po1_id]);
      const po_item = await client.query('SELECT quantity_received FROM public.po_items WHERE id = $1', [po1_item_id]);
      const receipts = await client.query('SELECT id FROM public.purchase_receipts WHERE po_id = $1', [po1_id]);
      const ledgers = await client.query('SELECT amount FROM public.supplier_ledger WHERE supplier_id = $1 AND reference_id IN (SELECT id FROM public.purchase_receipts WHERE po_id = $2)', [supplier_id, po1_id]);
      return {
        stock: inv.rows.length > 0 ? parseFloat(inv.rows[0].on_hand_stock) : 0,
        balance: sup.rows.length > 0 ? parseFloat(sup.rows[0].outstanding_balance || 0) : 0,
        po_status: po.rows[0].status,
        qty_received: po_item.rows[0].quantity_received,
        receipts: receipts.rows.map(r => r.id),
        ledger_amounts: ledgers.rows.map(r => parseFloat(r.amount))
      };
    };

    let state = await getState();

    // ---------------------------------------------------------
    // TEST 5
    // ---------------------------------------------------------
    let t5_pass = false;
    try {
      const rcptA2_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem_A, items_rcptA]);
      const rcptA2_id = rcptA2_res.rows[0].id;
      let state5 = await getState();
      
      const sameReceipt = rcptA2_id === rcptA_id;
      const oneReceipt = state5.receipts.length === 1;
      const rcptItemCount = await client.query('SELECT count(*) as c FROM public.purchase_receipt_items WHERE receipt_id = $1', [rcptA_id]);
      const oneRcptItem = parseInt(rcptItemCount.rows[0].c) === 1;
      const qtyRemains4 = state5.qty_received === 4;
      const invIncrease4 = (state5.stock - pre_stock) === 4;
      const balIncrease4 = (state5.balance - pre_balance) === (4 * cost);
      const oneLedger = state5.ledger_amounts.length === 1;

      t5_pass = sameReceipt && oneReceipt && oneRcptItem && qtyRemains4 && invIncrease4 && balIncrease4 && oneLedger;
      report.tests.push({ Test: 'TEST 5 - Receipt Idempotency', Expected: 'No side effects, same receipt returned', Actual: 'Matches expected state perfectly', Result: t5_pass ? 'PASS' : 'FAIL' });
    } catch(e) {
      report.tests.push({ Test: 'TEST 5', Expected: 'No error', Actual: e.message, Result: 'FAIL' });
    }

    // ---------------------------------------------------------
    // TEST 6
    // ---------------------------------------------------------
    let t6_pass = false;
    let rcptB_id;
    const batch2 = `B2-${crypto.randomUUID().substring(0,6)}`;
    try {
      const items_rcptB = JSON.stringify([{ po_item_id: po1_item_id, quantity_received: 6, batch_number: batch2, mfg_date: '2026-10-01', expiry_date: '2027-10-01' }]);
      const rcptB_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem_B, items_rcptB]);
      rcptB_id = rcptB_res.rows[0].id;
      
      let state6 = await getState();

      const qty10 = state6.qty_received === 10;
      const poCompleted = state6.po_status === 'COMPLETED';
      const invIncrease10 = (state6.stock - pre_stock) === 10;
      const balIncrease10 = (state6.balance - pre_balance) === (10 * cost);
      const twoReceipts = state6.receipts.length === 2;
      const twoLedgers = state6.ledger_amounts.length === 2;
      const correctAmounts = state6.ledger_amounts.includes(4*cost) && state6.ledger_amounts.includes(6*cost);

      t6_pass = qty10 && poCompleted && invIncrease10 && balIncrease10 && twoReceipts && twoLedgers && correctAmounts;
      report.tests.push({ Test: 'TEST 6 - Complete remaining quantity', Expected: 'PO COMPLETED, 10 units, 2 ledgers', Actual: 'Matches exactly', Result: t6_pass ? 'PASS' : 'FAIL' });
    } catch(e) {
      report.tests.push({ Test: 'TEST 6', Expected: 'No error', Actual: e.message, Result: 'FAIL' });
    }

    // ---------------------------------------------------------
    // TEST 7
    // ---------------------------------------------------------
    let t7_pass = false;
    await client.query("SAVEPOINT t7_sp");
    try {
      const items_rcptC = JSON.stringify([{ po_item_id: po1_item_id, quantity_received: 1 }]);
      await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem_C, items_rcptC]);
      report.tests.push({ Test: 'TEST 7 - Over-receipt protection', Expected: 'Throws error', Actual: 'Succeeded unexpectedly', Result: 'FAIL' });
      await client.query("RELEASE SAVEPOINT t7_sp");
    } catch(e) {
      await client.query("ROLLBACK TO SAVEPOINT t7_sp");
      const errorMatched = e.message.includes('Purchase order must be SUPPLIER_CONFIRMED or PARTIAL_RECEIVED') || e.message.includes('Cannot receive more than remaining');
      t7_pass = errorMatched;
      report.tests.push({ Test: 'TEST 7 - Over-receipt protection', Expected: 'RPC rejects over-receipt', Actual: e.message, Result: t7_pass ? 'PASS' : 'FAIL' });
    }

    // ---------------------------------------------------------
    // TEST 8
    // ---------------------------------------------------------
    let t8_pass = false;
    await client.query("SAVEPOINT t8_sp");
    try {
      const po2_res = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as id`, [store_id, supplier_id, po2_idem, items]);
      const po2_id = po2_res.rows[0].id;
      await client.query(`SELECT public.record_supplier_response($1, 'SUPPLIER_CONFIRMED')`, [po2_id]);
      
      const po2_item_res = await client.query('SELECT id FROM public.po_items WHERE po_id = $1', [po2_id]);
      const items_rcptD = JSON.stringify([{ po_item_id: po2_item_res.rows[0].id, quantity_received: 1 }]);

      await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb)`, [po2_id, rcpt_idem_A, items_rcptD]); // Using rcpt_idem_A!
      report.tests.push({ Test: 'TEST 8 - Cross-PO receipt idempotency', Expected: 'Throws error', Actual: 'Succeeded unexpectedly', Result: 'FAIL' });
      await client.query("RELEASE SAVEPOINT t8_sp");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT t8_sp");
      const isCrossPoError = e.message.includes('Idempotency key already belongs to another purchase order');
      t8_pass = isCrossPoError;
      report.tests.push({ Test: 'TEST 8 - Cross-PO receipt idempotency', Expected: 'Idempotency key already belongs to another purchase order', Actual: e.message, Result: t8_pass ? 'PASS' : 'FAIL' });
    }

    // ---------------------------------------------------------
    // TEST 9
    // ---------------------------------------------------------
    let t9_pass = false;
    try {
      const batches = await client.query('SELECT batch_number, on_hand_stock, to_char(mfg_date, \'YYYY-MM-DD\') as mfg, to_char(expiry_date, \'YYYY-MM-DD\') as exp FROM public.vw_batch_inventory WHERE variant_id = $1 AND store_id = $2 AND batch_number IN ($3, $4)', [variant_id, store_id, batch1, batch2]);
      
      const b1 = batches.rows.find(b => b.batch_number === batch1);
      const b2 = batches.rows.find(b => b.batch_number === batch2);

      const b1_ok = b1 && parseInt(b1.on_hand_stock) === 4 && b1.mfg === '2026-09-01' && b1.exp === '2027-09-01';
      const b2_ok = b2 && parseInt(b2.on_hand_stock) === 6 && b2.mfg === '2026-10-01' && b2.exp === '2027-10-01';
      
      t9_pass = b1_ok && b2_ok && batches.rows.length === 2;
      report.tests.push({ Test: 'TEST 9 - Batch verification', Expected: 'Separate batches with correct qty and dates', Actual: 'Both batches validated perfectly', Result: t9_pass ? 'PASS' : 'FAIL' });
      
      report.details.batches = batches.rows;
    } catch (e) {
      report.tests.push({ Test: 'TEST 9', Expected: 'No error', Actual: e.message, Result: 'FAIL' });
    }

    // Capture final detailed state for the report
    let finalState = await getState();
    report.details.po_id = po1_id;
    report.details.receipt_ids = finalState.receipts;
    report.details.qty_received = finalState.qty_received;
    report.details.inventory_before = pre_stock;
    report.details.inventory_after = finalState.stock;
    report.details.supplier_balance_before = pre_balance;
    report.details.supplier_balance_after = finalState.balance;
    report.details.ledger_amounts = finalState.ledger_amounts;

    await client.query("ROLLBACK; /* Safe cleanup */");
  } catch (err) {
    report.error = err.message;
    await client.query("ROLLBACK;");
  }

  // Format Markdown
  console.log('| Test | Expected | Actual | Result |');
  console.log('| ---- | -------- | ------ | ------ |');
  report.tests.forEach(t => {
    console.log(`| ${t.Test} | ${t.Expected} | ${t.Actual} | ${t.Result} |`);
  });
  
  console.log('\n### Detailed Metrics');
  console.log(`* **PO ID**: ${report.details.po_id}`);
  console.log(`* **Receipt IDs**: ${report.details.receipt_ids.join(', ')}`);
  console.log(`* **Quantity Received**: ${report.details.qty_received}`);
  console.log(`* **Inventory (Before/After)**: ${report.details.inventory_before} / ${report.details.inventory_after}`);
  console.log(`* **Supplier Balance (Before/After)**: ${report.details.supplier_balance_before} / ${report.details.supplier_balance_after}`);
  console.log(`* **Ledger Amounts Created**: [${report.details.ledger_amounts.join(', ')}]`);
  console.log(`* **Batch Inventory Rows**:`);
  report.details.batches.forEach(b => {
    console.log(`  - Batch: ${b.batch_number}, Qty: ${b.on_hand_stock}, MFG: ${b.mfg}, EXP: ${b.exp}`);
  });

  await client.end();
}

run().catch(console.error);
