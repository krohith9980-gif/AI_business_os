const fs = require('fs');
const env = fs.readFileSync('.env.prod.local', 'utf-8');
const anonKeyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/);
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)[1];
const supabaseKey = anonKeyMatch[1];

async function run() {
    const url = `${supabaseUrl}/rest/v1/sales?select=*,stores!sales_store_id_fkey(name),profiles(full_name),customers(name,phone_number),sale_items(*,product_variants(sku,products(name))),payments(*)&limit=1`;
    console.log("Fetching URL:", url);
    const res = await fetch(url, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
}
run();
