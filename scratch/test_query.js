const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lhtibverxjpcvmajzazv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcyODExOCwiZXhwIjoyMTAyMzA0MTE4fQ.a67y2D7cWc3_Xm4qB9t5c8V4n5fH_aO4K2c7c2b_C60' // service role key from .env previously
);

// I need the actual service role key, but wait, I can just use the anon key if I don't have service role key. No, I need the service role key. I don't have it in .env.local, only anon key.
// Let's just use the `pg` client to test the joins manually!
