import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      attributes,
      product:products (
        name
      )
    `)
    .ilike('sku', '%0C29513F%')
    
  if (error) {
    console.error(error)
  } else {
    console.log("Variants found:", JSON.stringify(data, null, 2))
  }
}

test()
