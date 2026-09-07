const fs = require('fs');
const env = fs.readFileSync('.env.prod.local', 'utf-8');
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
const anonKeyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/);
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)[1];
const supabaseKey = (keyMatch && keyMatch[1]) ? keyMatch[1] : anonKeyMatch[1];

async function run() {
    const url = `${supabaseUrl}/rest/v1/sales?select=*,stores!sales_store_id_fkey(name),profiles(full_name),customers(name,phone_number),sale_items(*,product_variants(sku,products(name))),payments(*)&order=created_at.desc&limit=1`;
    console.log("Fetching URL:", url);
    const res = await fetch(url, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body snippet:", text.substring(0, 500));
    try {
        const data = JSON.parse(text);
        if (data && data.length > 0) {
            console.log("Sale ID:", data[0].id);
            console.log("Invoice Number:", data[0].invoice_number);
            console.log("Store Name:", data[0].stores?.name);
            console.log("Cashier Name:", data[0].profiles?.full_name);
            console.log("Sale Items Count:", data[0].sale_items?.length);
            console.log("First Item Product Name:", data[0].sale_items?.[0]?.product_name);
            console.log("First Item Variant SKU:", data[0].sale_items?.[0]?.product_variants?.sku);
        }
    } catch (e) {}
}
run();
