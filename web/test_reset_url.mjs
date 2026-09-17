import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wtzyngynxxnncgnniyym.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0enluZ3lueHhubmNnbm5peXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTQxOTUsImV4cCI6MjEwMzc3MDE5NX0.vA3CnzohZjpRjoIKZtOF3WSO95RfDCBB6o3Mn3G9sPo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testReset() {
  console.log("Testing resetPasswordForEmail...");
  const { data, error } = await supabase.auth.resetPasswordForEmail('krohith56789@gmail.com', {
    redirectTo: 'https://ai-business-os-sblx-git-feat-purchases-suppliers-pro-78e4.vercel.app/auth/reset-callback'
  });

  if (error) {
    console.error("FAILED:", error.message);
  } else {
    console.log("SUCCESS! Password reset email sent without URL rejection.");
  }
}

testReset();
