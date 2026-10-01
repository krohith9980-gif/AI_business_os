import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.prod.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for inspection to bypass RLS initially to see if it's an RLS issue
)

async function test() {
  // Get the most recent sale
  const { data: recentSale, error: recentSaleError } = await supabase
    .from('sales')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (recentSaleError) {
    console.log("Failed to get recent sale:", recentSaleError)
    return
  }
  
  const saleId = recentSale.id
  console.log("Testing with Sale ID:", saleId)
  
  // Try the exact query from actions.ts
  const { data: saleData, error: saleError } = await supabase
    .from('sales')
    .select(`
      *,
      stores ( name ),
      profiles ( full_name, role ),
      customers ( name, phone_number ),
      sale_items (
        *,
        product_variants ( sku, products ( name ) )
      ),
      payments ( * )
    `)
    .eq('id', saleId)
    .single()
    
  if (saleError) {
    console.log("QUERY ERROR:", JSON.stringify(saleError, null, 2))
  } else {
    console.log("QUERY SUCCESS, Data keys:", Object.keys(saleData))
    console.log("Sale Items count:", saleData.sale_items.length)
  }
}

test()
