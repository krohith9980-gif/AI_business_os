const { execSync } = require('child_process');

function queryDb(sql) {
    const cmd = `npx supabase db query "${sql.replace(/"/g, '\\"')}" --linked`;
    console.log(`Running: ${cmd}`);
    try {
        const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
        // Find the JSON block
        const lines = output.split('\n');
        const jsonStr = lines.slice(1).join('\n').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Query Failed:', e.message);
        if (e.stdout) console.error(e.stdout.toString());
        if (e.stderr) console.error(e.stderr.toString());
        throw e;
    }
}

async function run() {
    const storeId = '09394761-4f48-4865-a9fe-e3e04c53a381';
    const supplierId = '661701c6-777f-470a-8761-41c16638474c';
    const idempotencyKey = 'TEST_E2E_GST_FIX_' + Date.now();

    // 1. Get initial supplier balance
    const initBalanceRes = queryDb(`SELECT outstanding_balance FROM suppliers WHERE id = '${supplierId}'`);
    const initialBalance = parseFloat(initBalanceRes.rows[0].outstanding_balance || 0);

    // 2. Execute process_invoice_purchase
    const items = [
        {
            name: "JUMP 4.9", quantity: 40, purchase_cost: 165, sale_cost: 200, 
            package_quantity: 2, package_unit: "Cases", units_per_package: 20, 
            gross_purchase_cost: 165, batch_number: "SCPL25031", is_new: true
        },
        {
            name: "SEMAX-50", quantity: 10, purchase_cost: 520, sale_cost: 600, 
            package_quantity: 1, package_unit: "Case", units_per_package: 10, 
            gross_purchase_cost: 520, batch_number: "SCPL25056", is_new: true
        }
    ];

    const rpcSql = `SELECT public.process_invoice_purchase('${storeId}', '${supplierId}', '${idempotencyKey}', '${JSON.stringify(items)}'::jsonb, 0, 0, 2124, 0, NULL, '', 0) as purchase_id`;
    const rpcRes = queryDb(rpcSql);
    const purchaseId = rpcRes.rows[0].purchase_id;
    console.log('Purchase ID:', purchaseId);

    // 3. Verify Purchase Order
    const poRes = queryDb(`SELECT grand_total, amount_paid, payment_status FROM purchase_orders WHERE id = '${purchaseId}'`);
    console.log('Purchase Order:', poRes.rows[0]);

    // 4. Verify Supplier Ledger
    const ledgerRes = queryDb(`SELECT amount, transaction_type FROM supplier_ledger WHERE purchase_order_id = '${purchaseId}'`);
    console.log('Supplier Ledger:', ledgerRes.rows);

    // 5. Verify Supplier Payments
    const paymentRes = queryDb(`SELECT id FROM supplier_payments WHERE idempotency_key = '${idempotencyKey}'`);
    console.log('Supplier Payments:', paymentRes.rows);

    // 6. Verify Outstanding Balance
    const newBalanceRes = queryDb(`SELECT outstanding_balance FROM suppliers WHERE id = '${supplierId}'`);
    console.log('New Outstanding Balance:', newBalanceRes.rows[0].outstanding_balance);
    console.log('Expected Balance:', initialBalance + 13924);

    // 7. Verify Inventory Movements
    const invRes = queryDb(`SELECT p.name, im.quantity_change FROM inventory_movements im JOIN products p ON im.product_id = p.id WHERE im.reference_id = '${purchaseId}'`);
    console.log('Inventory Movements:', invRes.rows);
}

run().catch(console.error);
