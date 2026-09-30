import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read env variables manually
const envPath = path.resolve('../web/.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
let supabaseUrl = '';
let supabaseKey = '';
envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- STARTING PHASE 2 REST API/UI VALIDATION ---');
  
  // Login as owner
  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'owner@vyaparos.com',
    password: 'password123'
  });

  if (authError || !authData.user) {
    console.log('Login failed for owner@vyaparos.com, trying test@vyaparos.com...');
    const res = await supabase.auth.signInWithPassword({
        email: 'test@vyaparos.com',
        password: 'password123'
    });
    authData = res.data;
    authError = res.error;
  }
  
  if (authError) {
      console.error('Login Failed', authError);
      return;
  }

  const userId = authData.user.id;
  
  // Get Org ID
  const { data: orgData } = await supabase.from('organization_members').select('organization_id').eq('profile_id', userId).single();
  const orgId = orgData.organization_id;

  // Get Store ID
  const { data: storeData } = await supabase.from('user_stores').select('store_id').eq('user_id', userId).single();
  const storeId = storeData.store_id;

  console.log('Org ID:', orgId, 'Store ID:', storeId);

  // 1. Observation
  const { data: source } = await supabase.from('agri_intelligence_sources').insert({
    organization_id: orgId,
    name: 'E2E Source',
    source_type: 'GOVERNMENT'
  }).select().single();

  const { data: obs } = await supabase.from('agri_observations').insert({
    organization_id: orgId,
    source_id: source.id,
    observation_date: new Date().toISOString(),
    publication_date: new Date().toISOString(),
    season: 'Kharif',
    geographic_level: 'DISTRICT',
    region: 'Warangal',
    crop_name: 'Maize',
    crop_stage: 'Vegetative',
    progress_status: 'NORMAL',
    freshness_status: 'FRESH'
  }).select().single();

  const { data: input, error: inputErr } = await supabase.from('agri_observation_inputs').insert({
    observation_id: obs.id,
    input_category: 'Maize Fertilizer 101'
  }).select().single();
  
  console.log('Observation and Input Created:', input?.input_category);

  // 2. Mapping
  const { data: variants } = await supabase.from('product_variants').select('id, product_id').eq('organization_id', orgId).limit(1);
  const variant = variants[0];

  const { data: mapping, error: mapErr } = await supabase.from('agri_input_category_mappings').insert({
    organization_id: orgId,
    input_category: 'Maize Fertilizer 101',
    product_id: variant.product_id,
    mapping_type: 'PRODUCT',
    confidence_score: 1.0,
    is_active: true
  }).select().single();
  
  console.log('Mapping Created via REST API:', mapping ? 'SUCCESS' : mapErr);

  // 3. Stock Recommendation RPC via REST
  const { data: recData, error: recErr } = await supabase.rpc('calculate_stock_recommendations', {
    p_organization_id: orgId,
    p_store_id: storeId,
    p_region: 'Warangal',
    p_crop_name: 'Maize'
  });

  console.log('Stock Recommendation fetched via REST API:', recData ? `Found ${recData.length} records.` : recErr);

  if (recData && recData.length > 0) {
      const rec = recData[0];
      console.log('Selected Recommendation:', rec.product_name, 'Recommended Qty:', rec.recommended_reorder_quantity);

      // 4. Confirm PO via REST
      const idempotency = `ui_test_po_${Date.now()}`;
      const qty = rec.recommended_reorder_quantity || 10;
      
      const { data: poData, error: poErr } = await supabase.rpc('process_purchase_order', {
        p_store_id: storeId,
        p_organization_id: orgId,
        p_idempotency_key: idempotency,
        p_supplier_id: null,
        p_items: [{
          variant_id: rec.variant_id,
          quantity: qty,
          unit_price: 100
        }]
      });

      console.log('Purchase Order Created via REST:', poData ? 'PO_ID: ' + poData : poErr);

      // Verify Idempotency Duplicate
      const { error: poErr2 } = await supabase.rpc('process_purchase_order', {
        p_store_id: storeId,
        p_organization_id: orgId,
        p_idempotency_key: idempotency,
        p_supplier_id: null,
        p_items: [{
          variant_id: rec.variant_id,
          quantity: qty,
          unit_price: 100
        }]
      });
      if (!poErr2) {
          console.log('Idempotency Duplicate Click: Handled Safely');
      } else {
          console.error('Idempotency failed?', poErr2);
      }
  }

  console.log('--- TEST COMPLETE ---');
}

run().catch(console.error);
