import fs from 'fs';

try {
    const rawData = fs.readFileSync('C:\\Users\\krohi\\Ai-Business-Os\\scratch\\audit_out_all.json', 'utf8');
    const jsonStart = rawData.indexOf('{');
    if (jsonStart === -1) {
        console.error("Could not find json start");
        process.exit(1);
    }
    const cleanData = rawData.substring(jsonStart);
    const parsed = JSON.parse(cleanData);
    const rows = parsed.rows[0].json_agg;
    console.log(`Found ${rows.length} total active variants.`);
    
    const discrepancies = [];
    
    for (const row of rows) {
        if (!row.movements && row.actual_balance === null) continue; // No stock ever
        
        let rawInbound = 0;
        let rawOutbound = 0;
        
        if (row.movements) {
            for (const [type, qty] of Object.entries(row.movements)) {
                if (['opening_stock', 'purchase_received', 'customer_return', 'transfer_in', 'adjustment'].includes(type)) {
                    rawInbound += qty;
                } else if (['sale', 'supplier_return', 'damage', 'transfer_out', 'correction'].includes(type)) {
                    rawOutbound += qty;
                }
            }
        }
        
        const dbTotalMovements = rawInbound - rawOutbound;
        const actualBalance = row.actual_balance || 0;
        
        // Let's assume the legacy code inserted quantity * item_size into inventory_movements.
        // And inventory_balances is exactly the sum of those multiplied movements.
        // We know this is true if dbTotalMovements === actualBalance.
        
        let theoreticalRawStock = 0;
        
        // Wait, if movements ARE ALREADY MULTIPLIED in the DB...
        // We can't know the user's ORIGINAL inputted quantity without dividing by item_size.
        // If packaging_type = 'NONE', multiplier should have been 1.
        // If packaging_type != 'NONE', multiplier should have been item_size.
        // But the legacy code multiplied by item_size IN ALL CASES (even NONE).
        
        // The CORRECT semantics we want in Production going forward:
        // Movement quantity = BASE SELLABLE ITEMS.
        // If the user bought 10 BOXES (units_per_pack=10), the movement quantity should be 100 base items.
        // BUT wait, in the legacy code, did the user input "10 boxes", and it multiplied by item_size?
        // Let's look at the old product creation: it passed `opening_stock_packages`.
        // Then `quantity = opening_stock_packages * units_per_pack`.
        // Then `record_inventory_movement` multiplied THAT by `item_size`!
        // So the DB currently has: quantity = inputted_packages * units_per_pack * item_size
        // BUT the correct quantity should just be: inputted_packages * units_per_pack!
        
        // Which means, the current inventory_movements.quantity is inflated by a factor of `item_size`!
        
        if (row.item_size > 1 && dbTotalMovements !== 0) {
             const trueIntendedStock = dbTotalMovements / row.item_size;
             discrepancies.push({
                 product_name: row.product_name,
                 item_size: row.item_size,
                 packaging_type: row.packaging_type,
                 units_per_pack: row.units_per_pack,
                 current_movements_sum: dbTotalMovements,
                 actual_balance: actualBalance,
                 true_intended_stock: trueIntendedStock,
                 multiplier_error: `Inflated by ${row.item_size}x`
             });
        }
    }
    
    console.log(JSON.stringify(discrepancies, null, 2));

} catch (err) {
    console.error(err);
}
