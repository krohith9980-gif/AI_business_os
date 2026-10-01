const { execSync } = require('child_process');

function runQuery(query) {
    try {
        const out = execSync(`npx supabase db query "${query}" --linked`, { stdio: 'pipe' }).toString();
        return out.trim();
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

console.log('--- Migration Validation Report ---');

console.log('\n[1] Migration Status:');
try {
    const listOut = execSync('npx supabase migration list --linked', { stdio: 'pipe' }).toString();
    console.log(listOut.split('\n').filter(l => l.includes('0050') || l.includes('0051')).join('\n'));
} catch (e) {
    console.log('Error listing migrations:', e.message);
}

console.log('\n[2] Enum values for po_status:');
console.log(runQuery("SELECT unnest(enum_range(NULL::po_status))::text;"));

console.log('\n[3] Functions:');
console.log(runQuery("SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name IN ('process_purchase_order', 'record_supplier_response', 'record_goods_receipt');"));

console.log('\n[4] purchase_receipts.idempotency_key Column:');
console.log(runQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_receipts' AND column_name='idempotency_key';"));

console.log('\n[5] purchase_receipts Uniqueness Constraints:');
console.log(runQuery("SELECT conname FROM pg_constraint WHERE conrelid = 'public.purchase_receipts'::regclass AND contype = 'u';"));

console.log('\n[6] trg_update_po_received_qty Trigger:');
console.log(runQuery("SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table = 'purchase_receipt_items' AND trigger_name = 'trg_update_po_received_qty';"));
