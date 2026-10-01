import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('--- INVESTIGATING STAGING DATABASE ---');

  // 1. Look for purchase orders with the exact final payable
  const { data: pos, error: poError } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent Purchase Orders:');
  if (poError) console.error(poError);
  else console.log(pos.map(p => ({ id: p.id, final_payable: p.final_payable, amount_paid: p.amount_paid, payment_status: p.payment_status })));

  // 2. Check Supplier Ledger
  const { data: ledgers, error: ledgerError } = await supabase
    .from('supplier_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nRecent Supplier Ledger Entries:');
  if (ledgerError) console.error(ledgerError);
  else console.log(ledgers.map(l => ({ id: l.id, supplier_id: l.supplier_id, amount: l.amount, transaction_type: l.transaction_type, purchase_order_id: l.purchase_order_id })));

  // 3. Check Supplier Payments
  const { data: payments, error: paymentError } = await supabase
    .from('supplier_payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nRecent Supplier Payments:');
  if (paymentError) console.error(paymentError);
  else console.log(payments.map(p => ({ id: p.id, amount: p.amount, reference_id: p.reference_id })));
}

investigate();
