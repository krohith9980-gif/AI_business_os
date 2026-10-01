import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Use service key to bypass RLS, OR use Anon key to simulate RLS.
// Let's use service key first just to see if the join works.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  const { data: purchases, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      status,
      created_at,
      po_items (
        id,
        quantity_ordered,
        purchase_cost
      ),
      suppliers (
        id,
        name
      )
    `)
    .eq('id', '9e8e1632-a691-4492-af6e-005124047fc8')
    
  console.log(JSON.stringify(purchases, null, 2));
  if (error) console.error("Error:", error);
}

investigate().catch(console.error);
