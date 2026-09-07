import fs from 'fs';

try {
    const rawData = fs.readFileSync('C:\\Users\\krohi\\Ai-Business-Os\\scratch\\audit_out_all.json', 'utf8');
    const jsonStart = rawData.indexOf('{');
    const cleanData = rawData.substring(jsonStart);
    const parsed = JSON.parse(cleanData);
    const rows = parsed.rows[0].json_agg;
    
    let md = `# Production Inventory Forensic Audit
**Project:** lhtibverxjpcvmajzazv
**Type:** READ-ONLY Verification

## PART 1 - Production Migration State
The following migrations are deployed on Production:
- **0032_worker_registration**: APPLIED
- **0033_atomic_product_creation**: APPLIED
- **0034_restore_owner**: APPLIED
- **0035_fix_inventory_stock_semantics**: NOT APPLIED
- **0036_fix_inventory_stock_semantics_v2**: NOT APPLIED
- **0037_fix_inventory_bugs**: NOT APPLIED

## PART 2 - Legacy Calculation Discrepancies
Below is the forensic analysis of EVERY active product variant currently in the Production database.

| Product Name | Product ID | Variant ID | Size | Pack | U/P | Inbound | Outbound | Theoretical | Actual | Discrepancy |
|---|---|---|---|---|---|---|---|---|---|---|
`;

    let totalDiscrepancies = 0;
    
    for (const row of rows) {
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
        
        // In legacy code, record_inventory_movement inserted (quantity * item_size) into inventory_movements.
        // So dbTotalMovements IS ALREADY MULTIPLIED.
        // To find the theoretical stock (base sellable items), we must divide by item_size.
        const theoreticalRawStock = dbTotalMovements / (row.item_size || 1);
        
        let discrepancy = actualBalance - theoreticalRawStock;
        
        let highlight = "";
        if (discrepancy !== 0) {
            totalDiscrepancies++;
            highlight = " ⚠️ ERROR";
        }
        
        md += `| ${row.product_name} | \`${row.product_id.split('-')[0]}...\` | \`${row.variant_id.split('-')[0]}...\` | ${row.item_size} | ${row.packaging_type} | ${row.units_per_pack} | ${rawInbound} | ${rawOutbound} | **${theoreticalRawStock}** | **${actualBalance}** | **${discrepancy}**${highlight} |\n`;
    }

    md += `\n### Summary
- Total Active Variants Analyzed: **${rows.length}**
- Total Variants with Legacy Discrepancies: **${totalDiscrepancies}**

**Discovery:** The legacy \`record_inventory_movement\` function multiplied the quantity by \`item_size\` *before* inserting it into \`inventory_movements\`. Thus, both the ledger (\`inventory_movements\`) and the aggregate (\`inventory_balances\`) are mutually consistent, but mathematically inflated for any product where \`item_size > 1\`.

To repair the legacy data properly, we must fix **both** tables by dividing the quantities by \`item_size\`.
`;

    fs.writeFileSync('C:\\Users\\krohi\\Ai-Business-Os\\scratch\\gen_report.md', md);
    console.log("Report generated.");
} catch (err) {
    console.error(err);
}
