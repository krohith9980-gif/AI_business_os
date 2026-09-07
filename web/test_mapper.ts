import { mapSaleToReceiptData } from './src/app/dashboard/pos/receipt/mapper';

// MOCK DATA 1: Legacy Sale (Created before 0038)
const legacySale = {
  id: 'legacy-123',
  created_at: '2026-08-01T10:00:00Z',
  grand_total: 100,
  sale_items: [
    {
      id: 'item-1',
      product_name: null, // Null because it's a legacy sale
      sku: null,
      unit_selling_price: 100,
      quantity: 1,
      // Current relational data
      product_variants: {
        sku: 'NEW-SKU-123',
        products: { name: 'New Product Name' }
      }
    }
  ]
};

// MOCK DATA 2: New Sale (Created after 0038)
const newSale = {
  id: 'new-456',
  created_at: '2026-09-04T10:00:00Z',
  grand_total: 200,
  sale_items: [
    {
      id: 'item-2',
      product_name: 'Historical Snapshot Name',
      sku: 'SNAPSHOT-SKU',
      unit_selling_price: 200,
      quantity: 1,
      // Current relational data might have changed, but it shouldn't be used
      product_variants: {
        sku: 'COMPLETELY-DIFFERENT-SKU',
        products: { name: 'Completely Different Name' }
      }
    }
  ]
};

console.log('--- TESTING LEGACY SALE ---');
const legacyReceipt = mapSaleToReceiptData(legacySale);
console.log('Legacy Receipt Item Name:', legacyReceipt.items[0].productName);
console.log('Legacy Receipt Item Desc:', legacyReceipt.items[0].description);
console.log('Legacy Receipt Item SKU:', legacyReceipt.items[0].sku);

console.log('\n--- TESTING NEW SALE ---');
const newReceipt = mapSaleToReceiptData(newSale);
console.log('New Receipt Item Name:', newReceipt.items[0].productName);
console.log('New Receipt Item SKU:', newReceipt.items[0].sku);
