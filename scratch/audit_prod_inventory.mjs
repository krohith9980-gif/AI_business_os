import { Client } from 'pg';
import fs from 'fs';

const prodConnectionString = 'postgresql://postgres:Rohith89%40%40@db.lhtibverxjpcvmajzazv.supabase.co:5432/postgres';

async function auditInventory() {
  const client = new Client({
    connectionString: prodConnectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    console.log("=== PART 1: MIGRATION STATE ===");
    const { rows: migrations } = await client.query(`
      SELECT version, name
      FROM supabase_migrations.schema_migrations
      WHERE version >= '0032'
      ORDER BY version ASC;
    `);
    console.log(JSON.stringify(migrations, null, 2));

    console.log("\\n=== PART 2: FORENSIC INVENTORY AUDIT ===");
    
    // We want to calculate the theoretical stock vs actual stock
    // Theoretical = sum of inbound movements - sum of outbound movements
    // Actual = inventory_balances.on_hand_stock
    // Note: If legacy code inserted multiplied quantities into inventory_movements, 
    // we need to see what's actually in inventory_movements.

    const query = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.organization_id,
        v.id AS variant_id,
        v.item_size,
        v.packaging_type,
        v.units_per_pack,
        b.on_hand_stock AS actual_balance,
        (
          SELECT COALESCE(SUM(
            CASE 
              WHEN m.movement_type IN ('PURCHASE', 'RETURN_IN', 'ADJUSTMENT_UP') THEN m.quantity
              WHEN m.movement_type IN ('SALE', 'RETURN_OUT', 'ADJUSTMENT_DOWN', 'WASTE') THEN -m.quantity
              ELSE 0
            END
          ), 0)
          FROM public.inventory_movements m
          WHERE m.variant_id = v.id
        ) AS raw_movements_sum
      FROM public.products p
      JOIN public.product_variants v ON v.product_id = p.id
      LEFT JOIN public.inventory_balances b ON b.variant_id = v.id
      ORDER BY p.organization_id, p.name;
    `;

    const { rows: auditRows } = await client.query(query);
    
    let totalDiscrepancies = 0;
    const discrepancies = [];

    for (const row of auditRows) {
      // If raw_movements_sum == actual_balance, then inventory_movements records the EXACT amount that was added to inventory_balances.
      // If legacy code did: v_total_quantity = quantity * item_size, and inserted v_total_quantity into BOTH movements and balances,
      // then raw_movements_sum WILL equal actual_balance, but BOTH will be wrong if they were multiplied by item_size.
      // We need to fetch the original Purchase/Sale items to know the REAL intended quantity!
      // But wait! Does inventory_movements store the MULTIPLIED quantity or the RAW quantity?
      
      let hasDiscrepancy = false;
      let notes = [];

      // Let's just output everything for now and inspect it to find out where the multiplier was applied.
      if (row.actual_balance !== row.raw_movements_sum) {
          hasDiscrepancy = true;
          notes.push("Balance != sum of movements");
      }

      // Check if item_size seems to have influenced the raw_movements_sum
      // (This requires looking at specific movements and their reference_id, which we'll do in the next query)
      
      discrepancies.push(row);
    }

    // Save to a file for review
    fs.writeFileSync('C:\\Users\\krohi\\Ai-Business-Os\\scratch\\inventory_audit_raw.json', JSON.stringify(discrepancies, null, 2));
    console.log(`Processed ${discrepancies.length} variants. Saved to scratch/inventory_audit_raw.json`);

    // Let's sample a few movements to see if they were multiplied by item_size
    const { rows: sampleMovements } = await client.query(`
      SELECT m.id, m.variant_id, m.movement_type, m.quantity as movement_quantity, 
             v.item_size, p.name as product_name
      FROM public.inventory_movements m
      JOIN public.product_variants v ON m.variant_id = v.id
      JOIN public.products p ON v.product_id = p.id
      WHERE v.item_size > 1 AND m.quantity > 0
      LIMIT 10;
    `);
    console.log("\\n=== SAMPLE MOVEMENTS WITH ITEM_SIZE > 1 ===");
    console.log(JSON.stringify(sampleMovements, null, 2));

  } catch (err) {
    console.error("Error connecting to Production:", err);
  } finally {
    await client.end();
  }
}

auditInventory();
