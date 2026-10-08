const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.prod.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProd() {
    const { data, error } = await supabase.from('agri_observations').select('id').limit(1);
    if (error) {
        console.log("agri_observations error:", error.message);
    } else {
        console.log("agri_observations exists!");
    }
    
    const { data: d2, error: e2 } = await supabase.from('suppliers').select('id, phone').limit(1);
    if (e2) {
        console.log("suppliers.phone error:", e2.message);
    } else {
        console.log("suppliers.phone exists!");
    }
}
checkProd();
