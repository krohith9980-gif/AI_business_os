const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const imagePath = 'C:\\Users\\krohi\\.gemini\\antigravity-ide\\brain\\9b4f1ce2-8e63-4d87-bad7-0ef8cc4e5321\\.user_uploaded\\uploaded_media_1788983337000.png';
const base64Image = fs.readFileSync(imagePath, 'base64');

// exact schema from route.ts
const productExtractionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    documentType: { type: SchemaType.STRING },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          productName: { type: SchemaType.STRING, nullable: true },
          fullProductIdentity: { type: SchemaType.STRING, nullable: true },
          chemicalName: { type: SchemaType.STRING, nullable: true },
          concentration: { type: SchemaType.STRING, nullable: true },
          formulation: { type: SchemaType.STRING, nullable: true },
          brand: { type: SchemaType.STRING, nullable: true },
          manufacturer: { type: SchemaType.STRING, nullable: true },
          batchNumber: { type: SchemaType.STRING, nullable: true },
          mfgDate: { type: SchemaType.STRING, nullable: true },
          expiryDate: { type: SchemaType.STRING, nullable: true },
          mrp: { type: SchemaType.NUMBER, nullable: true },
          purchaseCost: { type: SchemaType.NUMBER, nullable: true },
          purchaseQuantity: { type: SchemaType.NUMBER, nullable: true },
          grossPurchaseCost: { type: SchemaType.NUMBER, nullable: true },
          lineDiscountPercentage: { type: SchemaType.NUMBER, nullable: true },
          lineDiscountAmount: { type: SchemaType.NUMBER, nullable: true },
          netPurchaseCost: { type: SchemaType.NUMBER, nullable: true },
          packageQuantity: { type: SchemaType.NUMBER, nullable: true },
          packageUnit: { type: SchemaType.STRING, nullable: true },
          baseQuantity: { type: SchemaType.NUMBER, nullable: true },
          sku: { type: SchemaType.STRING, nullable: true },
          barcode: { type: SchemaType.STRING, nullable: true },
          measurementValue: { type: SchemaType.NUMBER, nullable: true },
          measurementUnit: { type: SchemaType.STRING, nullable: true },
          packagingType: { type: SchemaType.STRING, nullable: true },
          unitsPerPack: { type: SchemaType.NUMBER, nullable: true },
          confidence: { type: SchemaType.OBJECT, nullable: true }
        },
        required: [
          'fullProductIdentity', 'productName', 'manufacturer', 'brand', 'sku', 'barcode', 'batchNumber', 
          'measurementValue', 'measurementUnit', 'packagingType', 'unitsPerPack', 
          'mfgDate', 'expiryDate', 'purchaseCost', 'purchaseQuantity', 'mrp', 'confidence'
        ]
      }
    },
    supplierName: { type: SchemaType.STRING, nullable: true },
    invoiceNumber: { type: SchemaType.STRING, nullable: true },
    invoiceDate: { type: SchemaType.STRING, nullable: true },
    invoiceDiscount: { type: SchemaType.NUMBER, nullable: true },
    taxAmount: { type: SchemaType.NUMBER, nullable: true },
    invoiceTotal: { type: SchemaType.NUMBER, nullable: true }
  },
  required: ['documentType', 'items']
};

const prompt = `
System Instruction:
You are an OCR extraction assistant for a fertilizer and agricultural store management system.
Your job is to analyze the provided image (either a product package/bottle or a purchase invoice) and extract product catalog information.

CRITICAL RULES:
1. DO NOT GUESS OR INVENT ANY VALUES. If a field is not clearly visible, readable, or deducible from the image, you MUST return null.
2. Never invent: HSN, barcode, SKU, MRP, purchase cost, dates, units per pack, or quantity.
3. If the image is an INVOICE with multiple items, extract an array of all detected products.
4. If the image is a SINGLE PACKAGE, extract the single product.
5. Provide confidence status for specified fields as 'high', 'uncertain', or 'not_found'.
6. Do not make any financial or pricing decisions. If purchase cost is not explicitly written on a package, return null (do not copy MRP).
7. For agro products, aggressively extract and remove the chemical information (chemical name, concentration, formulation) from the productName, placing them in their respective fields.
8. If the boundary between commercial product name and chemical is ambiguous or you are not sure what text is the commercial name, DO NOT SILENTLY DELETE TEXT. You must preserve the full text in productName and mark the productName confidence as "uncertain".
9. INVOICE PACKAGING: If an invoice specifies packaging (e.g., "4 CTN, 40 Nos"), packageQuantity is 4, packageUnit is "CTN", baseQuantity is 40. DO NOT swap package quantity and base quantity. DO NOT normalize package unit (CTN MUST remain CTN, PAC MUST remain PAC). DO NOT GUESS unitsPerPack if it cannot be derived.
10. INVOICE DISCOUNTS: If an invoice specifies a discount (e.g., 30%), extract it into lineDiscountPercentage and calculate the total lineDiscountAmount (gross rate * base quantity * discount%). DO NOT output per-unit discount.
11. TAX SEMANTICS: If an invoice gives a taxable line rate AND a separate GST/tax, you MUST extract the TAXABLE LINE RATE as the grossPurchaseCost. If an invoice gives ONLY a GST-inclusive rate and no separate tax information, extract that value and do NOT reverse-calculate tax.

Extract the requested fields according to the strict JSON schema. If you are uncertain about a value, return null for it and mark confidence as 'uncertain'.
`;

async function runTest() {
  console.log('1. Starting AI Extraction...');
  const fallbackModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];
  let result;
  
  for (const modelName of fallbackModels) {
    console.log(`[AI OCR] trying model: ${modelName}`);
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: productExtractionSchema
        }
      });
      result = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: base64Image } }
      ]);
      console.log(`[AI OCR] ${modelName} success`);
      break;
    } catch (e) {
      console.error(`[AI OCR] ${modelName} failed:`, e.message);
    }
  }
  
  if (!result) {
    console.error('All models failed');
    return;
  }

  let responseText = result.response.text();
  responseText = responseText.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  const extractedData = JSON.parse(responseText);

  console.log('--- OCR ITEMS BEFORE SAVE ---');
  extractedData.items.forEach((item, idx) => {
    console.log(`Product ${idx + 1}: ${item.productName}`);
    console.log(`  Batch: ${item.batchNumber}`);
    console.log(`  MFG: ${item.mfgDate}`);
    console.log(`  EXP: ${item.expiryDate}`);
  });

  // Login to get session for RPC (optional, but good practice to get auth context)
  const { data: { user }, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'krohith56789@gmail.com',
    password: 'password123'
  });

  if (loginErr || !user) {
    console.error('Login failed', loginErr);
    return;
  }

  // Get store & supplier from Staging
  const { data: store } = await supabase.from('stores').select('id, organization_id').eq('name', 'Main Store').single();
  const { data: supplier } = await supabase.from('suppliers').select('id').eq('name', 'Sanwi Chemicals').single();

  if (!store || !supplier) {
    console.error('Missing store or supplier data in Staging DB');
    return;
  }

  // Find variants for the items
  const { data: variants } = await supabase.from('product_variants').select('id, product:product_id(name)');
  
  const payloadItems = extractedData.items.map(item => {
    const v = variants.find(v => v.product.name.includes(item.productName)) || variants[0];
    return {
      is_new: false,
      variant_id: v.id,
      purchase_cost: item.netPurchaseCost || item.purchaseCost,
      sale_cost: 200,
      quantity: item.baseQuantity || item.purchaseQuantity,
      gross_purchase_cost: item.grossPurchaseCost || item.purchaseCost,
      discount_percentage: item.lineDiscountPercentage || 0,
      discount_amount: item.lineDiscountAmount || 0,
      batch_number: item.batchNumber,
      mfg_date: item.mfgDate,
      expiry_date: item.expiryDate,
      attributes: item
    };
  });

  console.log('\n2. Calling process_invoice_purchase RPC...');
  const idempotencyKey = crypto.randomUUID();
  const { data: poId, error: rpcError } = await supabase.rpc('process_invoice_purchase', {
    p_store_id: store.id,
    p_supplier_id: supplier.id,
    p_idempotency_key: idempotencyKey,
    p_items: payloadItems,
    p_invoice_discount: 0,
    p_additional_discount: 0,
    p_tax_total: extractedData.taxAmount || 0,
    p_amount_paid: 0,
    p_payment_method: 'CASH',
    p_payment_reference: null,
    p_round_off: 0
  });

  if (rpcError) {
    console.error('RPC Error:', rpcError);
    return;
  }

  console.log(`Save Succeeded! Purchase ID: ${poId}`);

  console.log('\n3. Verifying Database Records...');
  
  const { data: poItems } = await supabase.from('po_items').select('*').eq('purchase_order_id', poId);
  console.log('\npo_items:');
  poItems.forEach(i => console.log(`  - Variant: ${i.variant_id} | Batch: ${i.batch_number} | MFG: ${i.mfg_date} | EXP: ${i.expiry_date}`));

  // get receipts
  const { data: receipts } = await supabase.from('purchase_receipts').select('id').eq('purchase_order_id', poId);
  if (receipts && receipts.length > 0) {
    const { data: rcptItems } = await supabase.from('purchase_receipt_items').select('*').in('receipt_id', receipts.map(r => r.id));
    console.log('\npurchase_receipt_items:');
    rcptItems.forEach(i => console.log(`  - Variant: ${i.variant_id} | Batch: ${i.batch_number} | MFG: ${i.mfg_date} | EXP: ${i.expiry_date}`));
  }

  const { data: invMoves } = await supabase.from('inventory_movements').select('*').eq('reference_id', poId).eq('movement_type', 'PURCHASE_RECEIPT');
  console.log('\ninventory_movements:');
  invMoves.forEach(i => console.log(`  - Variant: ${i.variant_id} | Batch: ${i.batch_number} | MFG: ${i.mfg_date} | EXP: ${i.expiry_date}`));
  
  console.log('\nDone.');
}

runTest().catch(console.error);
