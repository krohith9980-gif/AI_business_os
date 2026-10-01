import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const prodConnectionString = 'postgresql://postgres:Rohith89%40%40@db.lhtibverxjpcvmajzazv.supabase.co:5432/postgres';

async function runAudit() {
  console.log("=== PRODUCTION READ-ONLY AUDIT ===");
  const client = new Client({
    connectionString: prodConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    console.log("\\n--- 1. REMOTE MIGRATION LIST ---");
    const { rows: migrations } = await client.query(`
      SELECT version, name, statements 
      FROM supabase_migrations.schema_migrations 
      ORDER BY version DESC 
      LIMIT 10;
    `);
    console.log(JSON.stringify(migrations.map(m => ({ version: m.version, name: m.name })), null, 2));

    console.log("\\n--- 2. FUNCTION DEFINITIONS ---");
    const funcs = ['create_product_with_opening_stock', 'record_inventory_movement', 'register_worker_profile'];
    
    for (const funcName of funcs) {
      console.log(`\\nFunction: ${funcName}`);
      const { rows } = await client.query(`
        SELECT 
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as signature,
          p.prosecdef as security_definer,
          p.proconfig as search_path,
          pg_get_userbyid(p.proowner) as owner,
          p.proacl as privileges
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1;
      `, [funcName]);
      console.log(JSON.stringify(rows, null, 2));
    }

    console.log("\\n--- 3. CHECK FOR STRUCTURAL TABLE CHANGES ---");
    // Just pulling latest columns from relevant tables to see if they were modified
    const { rows: cols } = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('inventory_movements', 'inventory_balances', 'products')
      AND column_name = 'quantity' OR (table_name='inventory_balances' AND column_name='on_hand_stock');
    `);
    console.log(JSON.stringify(cols, null, 2));

  } catch (err) {
    console.error("Error connecting to Production:", err);
  } finally {
    await client.end();
  }

  console.log("\\n--- 4. LOCAL MIGRATION FILE CONTENTS ---");
  const migrationsDir = path.resolve(process.cwd(), '../supabase/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.startsWith('0032') || f.startsWith('0033') || f.startsWith('0034') || f.startsWith('0035') || f.startsWith('0036') || f.startsWith('0037'));
  
  for (const f of files) {
    console.log(`\\nFile: ${f}`);
    const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    // summarize if it contains CREATE TABLE, ALTER TABLE, INSERT, UPDATE, DELETE
    const hasCreateTable = /CREATE TABLE/i.test(content);
    const hasAlterTable = /ALTER TABLE/i.test(content);
    const hasInsert = /INSERT INTO/i.test(content);
    const hasUpdate = /UPDATE/i.test(content);
    const hasDelete = /DELETE FROM/i.test(content);
    console.log(`Contains CREATE TABLE: ${hasCreateTable}`);
    console.log(`Contains ALTER TABLE: ${hasAlterTable}`);
    console.log(`Contains INSERT: ${hasInsert}`);
    console.log(`Contains UPDATE: ${hasUpdate}`);
    console.log(`Contains DELETE: ${hasDelete}`);
  }
}

runAudit();
