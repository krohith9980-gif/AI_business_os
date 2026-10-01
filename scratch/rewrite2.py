import re

filepath = r"c:\Users\krohi\Ai-Business-Os\web\src\app\dashboard\purchases\AIInvoiceModal.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Fix findBestMatch
old_match = r"""    for \(const v of variants\) \{
      const vName = Array\.isArray\(v\.product\) \? v\.product\[0\]\?\.name : v\.product\?\.name
      if \(vName && vName\.toLowerCase\(\) === targetName\) return v\.id
      if \(vName && vName\.toLowerCase\(\)\.includes\(targetName\)\) return v\.id
    \}"""
new_match = """    for (const v of variants) {
      const vName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name
      // Exact match only to prevent over-matching different packaging variants
      if (vName && vName.toLowerCase() === targetName) return v.id
    }"""
content = re.sub(old_match, new_match, content)

# Fix AI item mapping
old_mapping = r"""          purchase_cost: item\.purchaseCost \|\| 0,
          sale_cost: matchedVariant \? matchedVariant\.selling_price : '',
          quantity: item\.purchaseQuantity \|\| item\.measurementValue \|\| 1,
          package_quantity: item\.purchaseQuantity \|\| undefined,
          package_unit: item\.packagingType \|\| undefined,
          units_per_package: item\.unitsPerPack \|\| undefined,
          gross_purchase_cost: item\.purchaseCost \|\| 0,
          discount_percentage: 0,
          discount_amount: 0,"""

new_mapping = """          purchase_cost: item.netPurchaseCost || item.purchaseCost || 0,
          sale_cost: matchedVariant ? matchedVariant.selling_price : '',
          quantity: item.baseQuantity || item.purchaseQuantity || item.measurementValue || 1,
          package_quantity: item.packageQuantity || undefined,
          package_unit: item.packageUnit || undefined,
          units_per_package: (item.baseQuantity && item.packageQuantity && item.packageQuantity > 0) ? (item.baseQuantity / item.packageQuantity) : (item.unitsPerPack || undefined),
          gross_purchase_cost: item.grossPurchaseCost || item.purchaseCost || 0,
          discount_percentage: item.lineDiscountPercentage || 0,
          discount_amount: item.lineDiscountAmount || 0,"""
content = re.sub(old_mapping, new_mapping, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated AIInvoiceModal.tsx logic successfully.")
