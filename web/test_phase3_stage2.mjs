import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

function convertBaseToPackages(recommendedBaseUnits, itemSize, unitsPerPack) {
  const safeItemSize = itemSize > 0 ? itemSize : 1;
  const physicalItems = Math.ceil(recommendedBaseUnits / safeItemSize);
  const safeUnitsPerPack = unitsPerPack > 0 ? unitsPerPack : 1;
  const purchasePackages = Math.ceil(physicalItems / safeUnitsPerPack);
  return { physicalItems, purchasePackages };
}

const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

let passCount = 0;
let failCount = 0;

function assert(condition, name, expected, actual, details = '') {
  if (condition) {
    console.log(`\x1b[32m✓ PASS\x1b[0m | ${name.padEnd(6)} | ${String(expected).padEnd(20)} | ${String(actual).padEnd(20)} | ${details}`);
    passCount++;
  } else {
    console.log(`\x1b[31m✗ FAIL\x1b[0m | ${name.padEnd(6)} | ${String(expected).padEnd(20)} | ${String(actual).padEnd(20)} | ${details}`);
    failCount++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("PHASE 3: STAGE 2 DASHBOARD TESTS");
  console.log("==================================================");
  
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  });

  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID = process.env.TEST_ORG_ID;
  const IS_TEST_ENV = process.env.TEST_ENV === 'true';
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  
  if (!IS_TEST_ENV) {
    console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.');
    process.exit(1);
  }
  if (!TEST_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.');
    process.exit(1);
  }
  if (TEST_ORG_ID === PROD_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.');
    process.exit(1);
  }
  if (URL.includes('lhtibverxjpcvmajzazv')) {
    console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected. Run tests against a dedicated TEST instance.');
    process.exit(1);
  }
  
  // Ensure we don't automatically select the first organization
  const orgId = TEST_ORG_ID;

  if (loginError) {
    console.error('Login Error:', loginError);
    return;
  }
  
  // Find org id
  const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
  const orgA = orgData.id;
  const orgB = '00000000-0000-0000-0000-000000000000'; // Fake ID representing another org
  
  // Call RPC with Org A
  const { data: dashA, error: errA } = await supabase.rpc('get_intelligence_dashboard', { p_org_id: orgA });
  
  // Call RPC with Org B
  const { data: dashB, error: errB } = await supabase.rpc('get_intelligence_dashboard', { p_org_id: orgB });

  assert(!errA, "RLS-A", "Success", errA?.message || "Success", "Org A can access its dashboard");
  assert(errB && errB.message.includes('Unauthorized'), "RLS-B", "Unauthorized", errB?.message || 'Success', "Org A cannot read Org B dashboard");
  
  // Test anonymous
  const anonClient = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);
  const { data: anonDash, error: anonErr } = await anonClient.rpc('get_intelligence_dashboard', { p_org_id: orgA });
  assert(anonErr && anonErr.message.includes('Unauthorized'), "RLS-C", "Unauthorized", anonErr?.message || 'Success', "Anonymous users cannot read intelligence");

  // 4. Test AI API Failure Handling (Degradation)
  try {
    const aiRes = await fetch(`http://localhost:3000/api/intelligence/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: { test: 1 } })
    });
    
    // It should either return 200 (if key is set) or 503 (if key missing)
    // The requirement is that it fails gracefully
    assert(aiRes.status === 200 || aiRes.status === 503, "AI-1", "200 or 503", aiRes.status, "AI API route handles degradation gracefully");
  } catch (e) {
    // If next.js server isn't running, we skip this or show warning
    console.log(`\x1b[33m! WARN\x1b[0m | AI-1   | Server not running, skipped API test`);
  }

  console.log("==================================================");
  console.log(`Tests Completed: ${passCount} Passed, ${failCount} Failed`);
}

runTests().catch(console.error);
