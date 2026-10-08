const fs = require('fs');

let content = fs.readFileSync('supabase/migrations/0047_fix_supplier_ledger_payment.sql', 'utf8');

// The file contains CREATE OR REPLACE FUNCTION public.process_invoice_purchase
let startIndex = content.indexOf("CREATE OR REPLACE FUNCTION public.process_invoice_purchase");
if (startIndex === -1) {
    console.log("Function not found");
    process.exit(1);
}

// Find the end of the function (since it's the last thing in the file, or ends with `END; $$;`)
let endIndex = content.indexOf("$$;", startIndex);
if (endIndex === -1) {
    console.log("End of function not found");
    process.exit(1);
}

let funcCode = content.substring(startIndex, endIndex + 3);

// We need to add DECLARE v_agricultural_use JSONB;
funcCode = funcCode.replace(
    'v_barcode TEXT;',
    'v_barcode TEXT;\n    v_agricultural_use JSONB;'
);

// We need to extract it from v_item
funcCode = funcCode.replace(
    "v_attributes := v_item->'attributes';",
    "v_attributes := v_item->'attributes';\n                v_agricultural_use := v_item->'agricultural_use';"
);

// We need to update the INSERT INTO products
funcCode = funcCode.replace(
    'INSERT INTO public.products (organization_id, category_id, name, is_active)',
    'INSERT INTO public.products (organization_id, category_id, name, agricultural_use, is_active)'
);

funcCode = funcCode.replace(
    'VALUES (v_org_id, v_category_id, v_product_name, true) RETURNING id INTO v_product_id;',
    'VALUES (v_org_id, v_category_id, v_product_name, v_agricultural_use, true) RETURNING id INTO v_product_id;'
);

fs.writeFileSync('supabase/migrations/0058_invoice_agricultural_use.sql', funcCode);
console.log("Created 0058_invoice_agricultural_use.sql");
