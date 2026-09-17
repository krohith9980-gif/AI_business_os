const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lhtibverxjpcvmajzazv.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM';

if (process.env.TEST_ENV !== 'true') {
  console.error("ABORT: TEST_ENV is not 'true'. Refusing to run E2E test against potentially live database.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  await supabase.auth.signInWithPassword({ email: 'krohith9980@gmail.com', password: 'Rohith89@@' });
  
  const sql = `
  DO $$
  DECLARE
    test_org UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff0';
    prod_org UUID := 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
    cat_id UUID;
    prod_id UUID;
    var_id UUID;
  BEGIN
    -- Setup dummy data
    INSERT INTO organizations (id, name) VALUES (test_org, 'TEST') ON CONFLICT DO NOTHING;
    
    INSERT INTO categories (organization_id, name) VALUES (prod_org, 'Test Cat') RETURNING id INTO cat_id;
    INSERT INTO categories (organization_id, name) VALUES (test_org, 'Test Cat 2') ON CONFLICT DO NOTHING;
    
    INSERT INTO products (organization_id, category_id, name) VALUES (prod_org, cat_id, 'Test Product FK') RETURNING id INTO prod_id;
    INSERT INTO product_variants (organization_id, product_id, sku) VALUES (prod_org, prod_id, 'SKU-FK-1') RETURNING id INTO var_id;
    
    -- Attempt CTE update
    WITH up AS (
      UPDATE products SET organization_id = test_org, category_id = NULL WHERE id = prod_id RETURNING id
    )
    UPDATE product_variants SET organization_id = test_org WHERE product_id IN (SELECT id FROM up);
    
    -- Verify
    IF EXISTS (SELECT 1 FROM products WHERE id = prod_id AND organization_id = test_org) THEN
      RAISE NOTICE 'CTE Update Succeeded!';
    ELSE
      RAISE NOTICE 'CTE Update Failed silently';
    END IF;
    
    -- Rollback everything
    RAISE EXCEPTION 'Rollback intentional';
  END $$;
  `;
  
  const { data, error } = await supabase.rpc('test_run_query', { query: sql });
  console.log('Result:', data || error);
}
run();
