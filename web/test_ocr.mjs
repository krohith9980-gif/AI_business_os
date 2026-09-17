
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key found in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Define schema directly to match route.ts exactly
const productExtractionSchema = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      description: 'Is this a single product box, or a supplier invoice? Return "product" or "invoice".'
    },
    items: {
      type: "array",
      description: 'List of individual products found in the image. Even if there is only one product, put it in this array.',
      items: {
        type: "object",
        properties: {
          productName: {
            type: "string",
            description: 'The CLEAN commercial product name, explicitly without chemical composition, concentration, or formulation. Example: For "ISO-P ISOPROTHIOLANE 40% EC", extract ONLY "ISO-P". If you cannot confidently determine the commercial boundary, preserve the full original text and mark confidence as uncertain.',
            nullable: true,
          },
          fullProductIdentity: {
            type: "string",
            description: 'The COMPLETE commercial product identity EXACTLY as written on the invoice, combining the name, size, volume, weight, formulation, and concentration. (e.g. "DIAMOND Paddy Spl 1 Ltr"). Do NOT strip the size/measurement from this field.',
            nullable: true,
          },
          chemicalName: {
            type: "string",
            description: 'The chemical name, active ingredient, or composition separated from the commercial name. E.g., "ISOPROTHIOLANE", "MANCOZEB".',
            nullable: true,
          },
          concentration: {
            type: "string",
            description: 'The concentration percentage. E.g., "40%", "17.8%".',
            nullable: true,
          },
          formulation: {
            type: "string",
            description: 'The formulation code. E.g., "EC", "SL", "WP", "WDG".',
            nullable: true,
          },
          brand: {
            type: "string",
            description: 'The brand name or trade name of the product. E.g., "Syngenta", "Bayer".',
            nullable: true,
          },
          manufacturer: {
            type: "string",
            description: 'The company that manufactured the product, if different from brand.',
            nullable: true,
          },
          batchNumber: {
            type: "string",
            description: 'The manufacturing Batch No. or Lot No.',
            nullable: true,
          },
          manufacturingDate: {
            type: "string",
            description: 'Mfg Date, extracted as text (e.g. "07-10-2025" or "Oct 2025").',
            nullable: true,
          },
          expiryDate: {
            type: "string",
            description: 'Expiry Date or Use By Date, extracted as text.',
            nullable: true,
          },
          mrp: {
            type: "number",
            description: 'Maximum Retail Price or marked price of the product.',
            nullable: true,
          },
          purchaseCost: {
            type: "number",
            description: 'If this is a supplier invoice, the net cost or rate of the product. Otherwise null.',
            nullable: true,
          },
          purchaseQuantity: {
            type: "number",
            description: 'If this is a supplier invoice, the total number of base units purchased (e.g. 40 Nos). Otherwise null.',
            nullable: true,
          },
          grossPurchaseCost: {
            type: "number",
            description: 'If supplier invoice: the pre-discount rate or gross cost per unit (e.g. 875).',
            nullable: true
          },
          lineDiscountPercentage: {
            type: "number",
            description: 'If supplier invoice: the line discount percentage (e.g. 30 for 30%).',
            nullable: true
          },
          lineDiscountAmount: {
            type: "number",
            description: 'If supplier invoice: the TOTAL discount amount for this line (e.g. 10500). Do NOT output per-unit discount here.',
            nullable: true
          },
          netPurchaseCost: {
            type: "number",
            description: 'If supplier invoice: the final net cost per unit after discount (e.g. 612.50).',
            nullable: true
          },
          packageQuantity: {
            type: "number",
            description: 'If supplier invoice: the number of outer packages/boxes (e.g. 4).',
            nullable: true
          },
          packageUnit: {
            type: "string",
            description: 'If supplier invoice: the exact text for the package unit (e.g. "CTN", "PAC", "BOX"). DO NOT normalize.',
            nullable: true
          },
          baseQuantity: {
            type: "number",
            description: 'If supplier invoice: the total individual base items (e.g. 40).',
            nullable: true
          },
          sku: {
            type: "string",
            description: 'The internal SKU or Article No. if visible. Mostly null for retail boxes.',
            nullable: true,
          },
          barcode: {
            type: "string",
            description: 'The 1D or 2D barcode number (EAN/UPC) if decipherable.',
            nullable: true,
          },
          measurementValue: {
            type: "number",
            description: 'The net quantity numeric part. E.g., for "500 ML", this is 500.',
            nullable: true,
          },
          measurementUnit: {
            type: "string",
            description: 'The net quantity unit part. One of "G", "KG", "ML", "L", "PCS".',
            nullable: true,
          },
          packagingType: {
            type: "string",
            description: 'The outer packaging. "BOX", "PACK", or "NONE" if it is just a single bottle/item.',
            nullable: true,
          },
          unitsPerPack: {
            type: "number",
            description: 'If it is a box containing multiple bottles, how many bottles are inside? Default to 1.',
            nullable: true,
          },
          confidence: {
            type: "object",
            description: 'For each key above, indicate if the AI is "certain" or "uncertain". If you are guessing, put "uncertain".',
            properties: {
              fullProductIdentity: { type: "string", enum: ['high', 'uncertain', 'not_found'] },
              productName: { type: "string", enum: ['high', 'uncertain', 'not_found'] },
              chemicalName: { type: "string", enum: ['high', 'uncertain', 'not_found'] }
            },
            required: ['fullProductIdentity', 'productName', 'chemicalName']
          }
        },
        required: [
          'fullProductIdentity', 'productName', 'manufacturer', 'brand', 'sku', 'barcode', 'batchNumber', 
          'measurementValue', 'measurementUnit', 'packagingType', 'unitsPerPack', 
          'manufacturingDate', 'expiryDate', 'purchaseCost', 'purchaseQuantity', 'mrp', 'confidence'
        ]
      }
    }
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

Extract the requested fields according to the strict JSON schema. If you are uncertain about a value, return null for it and mark confidence as 'uncertain'.
`;

async function run() {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: productExtractionSchema
    }
  });

  const imgData = fs.readFileSync('C:\\\\Users\\\\krohi\\\\.gemini\\\\antigravity-ide\\\\brain\\\\9b4f1ce2-8e63-4d87-bad7-0ef8cc4e5321\\\\.user_uploaded\\\\uploaded_media_1788983337000.png');
  const base64 = imgData.toString('base64');
  
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: 'image/png',
        data: base64
      }
    }
  ]);
  
  console.log(result.response.text());
}
run();
