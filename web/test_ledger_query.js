const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  });
  if (loginError) throw loginError;

  const referenceId = 'a7a68983-bc13-4d6d-8ebd-b3f47de7a0a1'; // Valid PO ID from previous script

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      suppliers ( name ),
      po_items!po_items_po_id_fkey (
        id,
        quantity_ordered,
        quantity_received,
        purchase_cost,
        gross_purchase_cost,
        discount_percentage,
        discount_amount,
        batch_number,
        mfg_date,
        expiry_date,
        product_variants (
          sku,
          unit_of_measure,
          products ( name )
        )
      )
    `)
    .eq('id', referenceId)
    .maybeSingle();

  console.log('PO Data:', !!po);
  if (poError) console.error('PO Error:', poError);

  const { data: receipt, error: receiptError } = await supabase
    .from('purchase_receipts')
    .select(`
      *,
      purchase_orders (
        suppliers ( name )
      ),
      purchase_receipt_items (
        id,
        quantity_received,
        batch_number,
        mfg_date,
        expiry_date,
        po_items!purchase_receipt_items_po_item_id_po_item_po_id_fkey (
          purchase_cost,
          gross_purchase_cost,
          discount_percentage,
          discount_amount,
          product_variants (
            sku,
            unit_of_measure,
            products ( name )
          )
        )
      )
    `)
    .eq('id', referenceId)
    .maybeSingle();

  console.log('Receipt Data:', !!receipt);
  if (receiptError) console.error('Receipt Error:', receiptError);
}

run().catch(console.error);
