const fs = require('fs');
const env = fs.readFileSync('.env.prod.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

// If we don't have service role key, we can try anon key to see if we get a relationship error (PostgREST parses relationships before applying RLS).
const anonKeyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/);

const supabaseUrl = urlMatch ? urlMatch[1] : null;
const supabaseKey = (keyMatch ? keyMatch[1] : (anonKeyMatch ? anonKeyMatch[1] : null));

async function run() {
    const url = `${supabaseUrl}/rest/v1/sales?select=*,stores(name),profiles(full_name,role),customers(name,phone_number),sale_items(*,product_variants(sku,products(name))),payments(*)&limit=1`;
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
