import re

# 1. Update PurchasesClient.tsx
filepath = r"c:\Users\krohi\Ai-Business-Os\web\src\app\dashboard\purchases\PurchasesClient.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add getVariantName helper
get_variant_name = """
function getVariantName(v: Variant): string {
  const baseName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name || '';
  if (!v.attributes) return baseName;
  
  // Extract sizing or volume attributes if they exist
  const sizeStr = v.attributes.size || v.attributes.volume || v.attributes.weight || v.attributes.measurement || v.attributes.variant || '';
  if (sizeStr && typeof sizeStr === 'string' && !baseName.toLowerCase().includes(sizeStr.toLowerCase())) {
    return `${baseName} ${sizeStr}`;
  }
  return baseName;
}
"""

# Insert after type definitions
content = re.sub(r"(type Variant = .*?\n)", r"\1" + get_variant_name, content)

# Replace const productName = ...
old_prod_name = r"const productName = Array\.isArray\(v\.product\) \? v\.product\[0\]\?\.name : v\.product\?\.name;"
new_prod_name = "const productName = getVariantName(v);"
content = re.sub(old_prod_name, new_prod_name, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)


# 2. Update AIInvoiceModal.tsx
filepath = r"c:\Users\krohi\Ai-Business-Os\web\src\app\dashboard\purchases\AIInvoiceModal.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Update Variant type
content = re.sub(
    r"type Variant = \{ id: string; sku: string; selling_price: number; product\?: \{ name: string \} \| \{ name: string \}\[\] \| null \}",
    r"type Variant = { id: string; sku: string; selling_price: number; attributes?: any; product?: { name: string } | { name: string }[] | null }",
    content
)

# Add getVariantName helper
content = re.sub(r"(type DraftItem = .*?\n)", get_variant_name + r"\1", content)

# Update findBestMatch
old_match = r"""    for \(const v of variants\) \{
      const vName = Array\.isArray\(v\.product\) \? v\.product\[0\]\?\.name : v\.product\?\.name
      // Exact match only to prevent over-matching different packaging variants
      if \(vName && vName\.toLowerCase\(\) === targetName\) return v\.id
    \}"""
new_match = """    // Match against fullProductIdentity first, then productName
    const fullTargetName = (aiItem.fullProductIdentity || aiItem.productName || '').toLowerCase()
    const targetName = (aiItem.productName || '').toLowerCase()
    
    if (!fullTargetName && !targetName) return ''
    
    for (const v of variants) {
      const vName = getVariantName(v)
      if (!vName) continue
      
      const vNameLower = vName.toLowerCase()
      // Exact match against full identity
      if (fullTargetName && vNameLower === fullTargetName) return v.id
      // Exact match against base identity
      if (targetName && vNameLower === targetName) return v.id
    }"""
content = re.sub(old_match, new_match, content)

# Update AI item product_name mapping
old_ai_map = r"product_name: item\.productName \|\| 'Unknown Product',"
new_ai_map = r"product_name: item.fullProductIdentity || item.productName || 'Unknown Product',"
content = re.sub(old_ai_map, new_ai_map, content)

# Update dropdown rendering in AIInvoiceModal
old_render = r"const vName = Array\.isArray\(v\.product\) \? v\.product\[0\]\?\.name : v\.product\?\.name"
new_render = r"const vName = getVariantName(v)"
content = re.sub(old_render, new_render, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated matching and display logic successfully.")
