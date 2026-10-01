const { Client } = require('pg');
const crypto = require('crypto');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const user_id = "62523573-58d2-4ce0-a640-f1593d6f67f0"; // Staging Manager Profile ID

  let report = {
    tests: [],
    details: {}
  };

  try {
    await client.query("BEGIN; set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    // Fetch dynamic context
    const storeRes = await client.query('SELECT id, organization_id FROM public.stores LIMIT 1');
    const store_id = storeRes.rows[0].id;
    const org_id = storeRes.rows[0].organization_id;
    
    const supRes = await client.query('SELECT id FROM public.suppliers LIMIT 1');
    const supplier_id = supRes.rows[0].id;
    
    const varRes = await client.query('SELECT id, selling_price FROM public.product_variants LIMIT 1');
    const variant_id = varRes.rows[0].id;

    const cost = 1000;

    const getState = async (po_id) => {
      const inv = await client.query('SELECT on_hand_stock FROM public.inventory_balances WHERE store_id = $1 AND variant_id = $2', [store_id, variant_id]);
      const sup = await client.query('SELECT outstanding_balance FROM public.suppliers WHERE id = $1', [supplier_id]);
      const po = po_id ? await client.query('SELECT status, payment_status, amount_paid FROM public.purchase_orders WHERE id = $1', [po_id]) : {rows: []};
      const sl = await client.query('SELECT sum(amount) as total FROM public.supplier_ledger WHERE supplier_id = $1 AND reference_id = $2', [supplier_id, po_id]);
      
      const p_ledger = po_id ? await client.query(`
        SELECT sum(amount) as paid 
        FROM public.supplier_ledger 
        WHERE supplier_id = $1 AND transaction_type = 'PAYMENT' AND reference_id = $2
      `, [supplier_id, po_id]) : {rows: []};
      
      return {
        stock: inv.rows.length > 0 ? parseFloat(inv.rows[0].on_hand_stock) : 0,
        balance: sup.rows.length > 0 ? parseFloat(sup.rows[0].outstanding_balance || 0) : 0,
        po_status: po.rows.length > 0 ? po.rows[0].status : null,
        payment_status: po.rows.length > 0 ? po.rows[0].payment_status : null,
        po_paid: po.rows.length > 0 ? parseFloat(po.rows[0].amount_paid || 0) : 0,
        po_ledger_total: sl.rows.length > 0 ? parseFloat(sl.rows[0].total || 0) : 0,
        payment_ledger_total: p_ledger.rows.length > 0 ? parseFloat(p_ledger.rows[0].paid || 0) : 0
      };
    };

    console.log("==========================================");
    console.log("TEST 1 - Credit");
    console.log("==========================================");
    
    let pre_state = await getState(null);
    const po1_idem = crypto.randomUUID();
    const items = JSON.stringify([{ variant_id, quantity: 10, purchase_cost: cost }]);
    const po1_res = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as id`, [store_id, supplier_id, po1_idem, items]);
    const po1_id = po1_res.rows[0].id;
    await client.query(`SELECT public.record_supplier_response($1, 'SUPPLIER_CONFIRMED')`, [po1_id]);
    
    let state1_pre = await getState(po1_id);
    console.log("Before Receipt:");
    console.log("PO Status:", state1_pre.po_status, " | Payment:", state1_pre.payment_status);
    console.log("Inv:", state1_pre.stock, " | Sup Outstanding:", state1_pre.balance);

    const po1_item_res = await client.query('SELECT id FROM public.po_items WHERE po_id = $1', [po1_id]);
    const rcpt_idem1 = crypto.randomUUID();
    // Receive 4 items. Value: 4000. No payment (Credit)
    const rcpt_items1 = JSON.stringify([{ po_item_id: po1_item_res.rows[0].id, quantity_received: 4 }]);
    const rcpt1_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem1, rcpt_items1]);
    const rcpt1_id = rcpt1_res.rows[0].id;
    
    // Check state after Receipt ONLY (Credit)
    let state1_post = await getState(po1_id);
    console.log("After Receipt (Credit):");
    console.log("PO Status:", state1_post.po_status, " | Payment:", state1_post.payment_status);
    console.log("Inv:", state1_post.stock, " | Sup Outstanding:", state1_post.balance);
    console.log("Receipt Value: 4000");
    console.log("Payment Amount: 0");
    
    const ledgers1 = await client.query("SELECT * FROM public.supplier_ledger WHERE reference_id = $1", [rcpt1_id]);
    console.log("Ledger Entries:", ledgers1.rows.length);

    console.log("==========================================");
    console.log("TEST 2 - Partially Paid");
    console.log("==========================================");
    
    // Use the same PO, receive the remaining 6 items. Value: 6000. Payment: 2000 via UPI.
    console.log("Before Receipt 2:");
    console.log("PO Status:", state1_post.po_status, " | Payment:", state1_post.payment_status);
    console.log("Inv:", state1_post.stock, " | Sup Outstanding:", state1_post.balance);

    const rcpt_idem2 = crypto.randomUUID();
    const rcpt_items2 = JSON.stringify([{ po_item_id: po1_item_res.rows[0].id, quantity_received: 6 }]);
    const rcpt2_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po1_id, rcpt_idem2, rcpt_items2]);
    const rcpt2_id = rcpt2_res.rows[0].id;
    
    // Simulate UI calling payment immediately after
    const pay_idem1 = crypto.randomUUID();
    const pay_res = await client.query(`SELECT public.record_supplier_payment($1, $2, $3, $4, $5, $6, $7) as id`, [
      store_id, supplier_id, pay_idem1, 2000, 'UPI', '', 'Partial payment for receipt'
    ]);
    const pay_id = pay_res.rows[0].id;
    
    let state2_post = await getState(po1_id);
    console.log("After Receipt (Partially Paid):");
    console.log("PO Status:", state2_post.po_status, " | Payment:", state2_post.payment_status);
    console.log("Inv:", state2_post.stock, " | Sup Outstanding:", state2_post.balance);
    console.log("Receipt Value: 6000");
    console.log("Payment Amount: 2000");
    console.log("Payment Method: UPI");
    
    const ledgers2 = await client.query("SELECT * FROM public.supplier_ledger WHERE reference_id = $1 OR reference_id = $2", [rcpt2_id, pay_id]);
    console.log("Ledger Entries (Receipt2 + Pay1):", ledgers2.rows.length);

    console.log("==========================================");
    console.log("TEST 3 - Paid in Full");
    console.log("==========================================");
    
    const po3_idem = crypto.randomUUID();
    const items3 = JSON.stringify([{ variant_id, quantity: 5, purchase_cost: cost }]);
    const po3_res = await client.query(`SELECT public.process_purchase_order($1, $2, $3, $4::jsonb) as id`, [store_id, supplier_id, po3_idem, items3]);
    const po3_id = po3_res.rows[0].id;
    await client.query(`SELECT public.record_supplier_response($1, 'SUPPLIER_CONFIRMED')`, [po3_id]);
    
    let state3_pre = await getState(po3_id);
    console.log("Before Receipt 3:");
    console.log("PO Status:", state3_pre.po_status, " | Payment:", state3_pre.payment_status);
    console.log("Inv:", state3_pre.stock, " | Sup Outstanding:", state3_pre.balance);

    const po3_item_res = await client.query('SELECT id FROM public.po_items WHERE po_id = $1', [po3_id]);
    const rcpt_idem3 = crypto.randomUUID();
    const rcpt_items3 = JSON.stringify([{ po_item_id: po3_item_res.rows[0].id, quantity_received: 5 }]);
    
    const rcpt3_res = await client.query(`SELECT public.record_goods_receipt($1, $2, $3::jsonb) as id`, [po3_id, rcpt_idem3, rcpt_items3]);
    const rcpt3_id = rcpt3_res.rows[0].id;
    
    const pay_idem3 = crypto.randomUUID();
    await client.query(`SELECT public.record_supplier_payment($1, $2, $3, $4, $5, $6, $7)`, [
      store_id, supplier_id, pay_idem3, 5000, 'CASH', '', 'Paid in full for receipt'
    ]);
    
    let state3_post = await getState(po3_id);
    console.log("After Receipt 3 (Paid in Full):");
    console.log("PO Status:", state3_post.po_status, " | Payment:", state3_post.payment_status);
    console.log("Inv:", state3_post.stock, " | Sup Outstanding:", state3_post.balance);
    console.log("Receipt Value: 5000");
    console.log("Payment Amount: 5000");
    console.log("Payment Method: BANK_TRANSFER");

    console.log("==========================================");
    console.log("ATOMICITY CHECK");
    console.log("==========================================");
    console.log("The UI executes record_goods_receipt followed by record_supplier_payment.");
    console.log("If record_goods_receipt succeeds but record_supplier_payment fails, the goods receipt AND supplier payable are committed permanently, while the payment is missing.");
    console.log("This is because they are independent RPC calls. The backend DOES NOT make them atomic as a single transaction.");

    await client.query("ROLLBACK;");
  } catch(e) {
    console.error("TEST FAILED:", e);
    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
}
run();
