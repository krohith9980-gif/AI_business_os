import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { createClient } from '@/utils/supabase/server';

// Initialize the API only if the key is available on the server
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Define the expected output schema for the model
const productExtractionSchema: any = {
  type: SchemaType.OBJECT,
  properties: {
    documentType: {
      type: SchemaType.STRING,
      description: 'Is this a single product box, or a supplier invoice? Return "product" or "invoice".'
    },
    items: {
      type: SchemaType.ARRAY,
      description: 'List of individual products found in the image. Even if there is only one product, put it in this array.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          productName: {
            type: SchemaType.STRING,
            description: 'The CLEAN commercial product name, explicitly without chemical composition, concentration, formulation, package text, or measurement text. Example: For "ISO-P ISOPROTHIOLANE 40% EC 20 X 500 ML", extract ONLY "ISO-P". If you cannot confidently determine the commercial boundary, preserve the text but strip out chemicals and measurements. DO NOT include chemicals.',
            nullable: true,
          },
          fullProductIdentity: {
            type: SchemaType.STRING,
            description: 'The COMPLETE commercial product identity EXACTLY as written on the invoice. Must preserve brand, chemical, concentration, formulation, measurement, and pack configuration (e.g., "JUMP 4.9 (Lambda Cyhalothrin 4.9% CS) 20 X 500 ML"). Do NOT strip the size or multipack string from this field.',
            nullable: true,
          },
          chemicalName: {
            type: SchemaType.STRING,
            description: 'The chemical name, active ingredient, or composition separated from the commercial name. E.g., "ISOPROTHIOLANE", "MANCOZEB".',
            nullable: true,
          },
          concentration: {
            type: SchemaType.STRING,
            description: 'The concentration percentage. E.g., "40%", "17.8%".',
            nullable: true,
          },
          formulation: {
            type: SchemaType.STRING,
            description: 'The formulation code. E.g., "EC", "SL", "WP", "WDG".',
            nullable: true,
          },
          brand: {
            type: SchemaType.STRING,
            description: 'The brand name or trade name of the product. E.g., "Syngenta", "Bayer".',
            nullable: true,
          },
          manufacturer: {
            type: SchemaType.STRING,
            description: 'The company that manufactured the product, if different from brand.',
            nullable: true,
          },
          batchNumber: {
            type: SchemaType.STRING,
            description: 'The manufacturing Batch No. or Lot No. (e.g. "SCPL25031"). Extract EXACTLY what is printed. Do NOT invent a batch number if none is visible.',
            nullable: true,
          },
          manufacturingDate: {
            type: SchemaType.STRING,
            description: 'Mfg Date, extracted as text (e.g. "07-10-2025" or "Oct 2025").',
            nullable: true,
          },
          expiryDate: {
            type: SchemaType.STRING,
            description: 'Expiry Date or Use By Date, extracted as text.',
            nullable: true,
          },
          mrp: {
            type: SchemaType.NUMBER,
            description: 'Maximum Retail Price or marked price of the product.',
            nullable: true,
          },
          purchaseCost: {
            type: SchemaType.NUMBER,
            description: 'If this is a supplier invoice, the net cost or rate of the product. Otherwise null.',
            nullable: true,
          },
          purchaseQuantity: {
            type: SchemaType.NUMBER,
            description: 'If this is a supplier invoice, the total number of base units purchased (e.g. 40 Nos). Otherwise null.',
            nullable: true,
          },
          grossPurchaseCost: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the TAXABLE / PRE-TAX rate or gross cost per unit (e.g. 875). If the invoice provides both a taxable rate and a GST-inclusive rate, you MUST extract the taxable/pre-tax rate.',
            nullable: true
          },
          lineDiscountPercentage: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the line discount percentage (e.g. 30 for 30%).',
            nullable: true
          },
          lineDiscountAmount: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the TOTAL discount amount for this line (e.g. 10500). Do NOT output per-unit discount here.',
            nullable: true
          },
          netPurchaseCost: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the final net cost per unit after discount (e.g. 612.50).',
            nullable: true
          },
          packageQuantity: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the number of outer packages/boxes (e.g. 2). NEVER confuse this with the multipack size. For "20 X 500 ML, 2 Cases", packageQuantity is 2.',
            nullable: true
          },
          packageUnit: {
            type: SchemaType.STRING,
            description: 'If supplier invoice: the exact text for the package unit (e.g. "CASES", "CTN", "BOX"). DO NOT normalize.',
            nullable: true
          },
          baseQuantity: {
            type: SchemaType.NUMBER,
            description: 'If supplier invoice: the total individual base items inside all packages (e.g. 40). Server will validate packageQuantity * unitsPerPack = baseQuantity.',
            nullable: true
          },
          sku: {
            type: SchemaType.STRING,
            description: 'The internal SKU or Article No. MUST be left null unless a real article number/SKU is unequivocally visible. NEVER invent a SKU. No AUTO- or SYS- SKUs.',
            nullable: true,
          },
          barcode: {
            type: SchemaType.STRING,
            description: 'The 1D or 2D barcode number (EAN/UPC) if decipherable.',
            nullable: true,
          },
          measurementValue: {
            type: SchemaType.NUMBER,
            description: 'The net quantity numeric part for EACH INDIVIDUAL BASE UNIT. E.g., for "20 X 500 ML", this is 500. DO NOT multiply this by the base quantity.',
            nullable: true,
          },
          measurementUnit: {
            type: SchemaType.STRING,
            description: 'The net quantity unit part for EACH INDIVIDUAL BASE UNIT. One of "G", "KG", "ML", "L", "LTR", "PCS".',
            nullable: true,
          },
          packagingType: {
            type: SchemaType.STRING,
            description: 'The outer packaging. "BOX", "PACK", or "NONE" if it is just a single bottle/item.',
            nullable: true,
          },
          unitsPerPack: {
            type: SchemaType.NUMBER,
            description: 'The number of individual items inside ONE package (e.g., for "20 X 500 ML", unitsPerPack is 20). NEVER output 20 as the packageQuantity.',
            nullable: true,
          },
          confidence: {
            type: SchemaType.OBJECT,
            description: 'For each key above, indicate if the AI is "certain" or "uncertain". If you are guessing, put "uncertain".',
            properties: {
              fullProductIdentity: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              productName: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              chemicalName: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              concentration: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              formulation: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              batchNumber: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              measurement: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              unitsPerPack: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              manufacturingDate: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              expiryDate: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              purchaseCost: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] },
              purchaseQuantity: { type: SchemaType.STRING, enum: ['high', 'uncertain', 'not_found'] }
            },
            required: ['fullProductIdentity', 'productName', 'chemicalName', 'concentration', 'formulation', 'batchNumber', 'measurement', 'unitsPerPack', 'manufacturingDate', 'expiryDate', 'purchaseCost', 'purchaseQuantity']
          }
        },
        required: [
          'fullProductIdentity', 'productName', 'manufacturer', 'brand', 'sku', 'barcode', 'batchNumber', 
          'measurementValue', 'measurementUnit', 'packagingType', 'unitsPerPack', 
          'manufacturingDate', 'expiryDate', 'purchaseCost', 'purchaseQuantity', 'mrp', 'confidence'
        ]
      }
    },
    supplierName: { type: SchemaType.STRING, description: "If document is an invoice, the name of the supplier or vendor.", nullable: true },
    invoiceNumber: { type: SchemaType.STRING, description: "If document is an invoice, the invoice number or bill number.", nullable: true },
    invoiceDate: { type: SchemaType.STRING, description: "If document is an invoice, the date on the invoice.", nullable: true },
    invoiceDiscount: { type: SchemaType.NUMBER, description: "If document is an invoice, the overall discount applied to the entire invoice, in currency.", nullable: true },
    taxAmount: { type: SchemaType.NUMBER, description: "If document is an invoice, the total tax amount on the invoice.", nullable: true },
    invoiceTotal: { type: SchemaType.NUMBER, description: "If document is an invoice, the final total payable amount on the invoice.", nullable: true }
  },
  required: ['documentType', 'items']
};

export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Not authenticated' }, { status: 401 });
    }

    // 2. Verify organization access
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('role')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Unauthorized: No active organization membership' }, { status: 403 });
    }
    
    const role = memberships[0].role;
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Unauthorized: Only Managers and Owners can scan products' }, { status: 403 });
    }

    if (!genAI) {
      return NextResponse.json(
        { error: 'AI Scanning API is not configured (GEMINI_API_KEY missing)' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { image, mimeType } = body;

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image or mimeType' }, { status: 400 });
    }
    
    if (!mimeType.startsWith('image/')) {
       return NextResponse.json({ error: 'Invalid mimeType. Must be an image.' }, { status: 400 });
    }

    // Size validation (approx limit ~4MB of base64 data)
    if (image.length > 5 * 1024 * 1024) {
       return NextResponse.json({ error: 'Image size exceeds maximum allowed limit' }, { status: 400 });
    }

    // 3. Prepare AI request
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.6-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: productExtractionSchema
      }
    });

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
    let result;
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        result = await model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: image
            }
          }
        ]);
        break; // Success
      } catch (err: unknown) {
        attempt++;
        const errMsg = err instanceof Error ? err.message : '';
        console.error(`Gemini API Error (Scan Attempt ${attempt}):`, errMsg);
        
        if (attempt >= maxAttempts || (!errMsg.includes('503') && !errMsg.includes('429'))) {
          // If it's not a rate limit / capacity error, or we exhausted retries, throw to main catch
          throw err;
        }
        
        // Wait before retrying (exponential backoff: 1s, 2s)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
    
    // Fallback if result is undefined (should theoretically throw above)
    if (!result) throw new Error('Failed to get result from Gemini API');

    let responseText = result.response.text();
    // Strip markdown formatting if present
    responseText = responseText.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    
    const extractedData = JSON.parse(responseText);

    console.log("=== AI EXTRACTION RESULT ===");
    console.log(JSON.stringify(extractedData.items, null, 2));
    console.log("============================");

    return NextResponse.json(extractedData);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '';
    console.error('Gemini API Error (Scan Final):', errMsg);
    
    let safeUserMessage = 'Failed to process image';
    if (errMsg.includes('503') || errMsg.includes('429')) {
      safeUserMessage = 'AI service is currently experiencing high demand. Please try again in a few moments.';
    } else if (errMsg.includes('400')) {
      safeUserMessage = 'AI service rejected the request. Please try a clearer image.';
    }
    
    return NextResponse.json({ error: safeUserMessage }, { status: 500 });
  }
}
