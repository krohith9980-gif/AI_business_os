'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addProduct(formData: FormData) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: 'Unauthorized: Not authenticated' }
    }

    // 1. Determine user's authorized organization securely on the server
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)

    if (memError) {
      console.error('Membership fetch error:', memError)
      return { error: 'Failed to verify organization membership' }
    }
    
    if (!memberships || memberships.length === 0) {
      return { error: 'No active organization found for this user' }
    }

    const { organization_id, role } = memberships[0]

    // Only Managers and Owners can add products
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return { error: 'Unauthorized: Only Managers and Owners can add products.' }
    }

    const name = formData.get('name')?.toString()
    const sku = formData.get('sku')?.toString()
    const purchaseCost = parseFloat(formData.get('purchase_cost')?.toString() || '0')
    const sellingPrice = parseFloat(formData.get('selling_price')?.toString() || '0')
    const trackingMode = formData.get('tracking_mode')?.toString() || 'NONE'
    
    // Optional fields
    const description = formData.get('description')?.toString() || null
    const categoryIdStr = formData.get('category_id')?.toString()
    const category_id = categoryIdStr && categoryIdStr !== '' ? categoryIdStr : null
    const imageUrl = formData.get('image_url')?.toString() || null
    const barcode = formData.get('barcode')?.toString() || null
    
    // Packaging & Stock fields
    const unitOfMeasure = formData.get('unit_of_measure')?.toString() || 'PCS'
    const itemSizeStr = formData.get('item_size')?.toString()
    const itemSize = itemSizeStr && !isNaN(parseFloat(itemSizeStr)) ? parseFloat(itemSizeStr) : 1
    const packagingType = formData.get('packaging_type')?.toString() || 'NONE'
    const unitsPerPack = parseInt(formData.get('units_per_pack')?.toString() || '1', 10)
    
    const openingStockInput = parseFloat(formData.get('opening_stock')?.toString() || '0')
    const selectedStoreId = formData.get('store_id')?.toString() || null
    
    // Attributes JSON
    let attributes = null
    const attributesStr = formData.get('attributes')?.toString()
    if (attributesStr) {
        try {
            attributes = JSON.parse(attributesStr)
        } catch {
            return { error: 'Invalid attributes JSON format' }
        }
    }

    if (!name || !sku) {
      return { error: 'Name and SKU are required' }
    }

    if (isNaN(purchaseCost) || purchaseCost < 0) {
        return { error: 'Invalid purchase cost' }
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
        return { error: 'Invalid selling price' }
    }

    // 2. Call the RPC to insert the product and variant atomically
    const { data, error: rpcError } = await supabase.rpc('create_product_with_variant', {
        p_organization_id: organization_id,
        p_name: name,
        p_sku: sku,
        p_purchase_cost: purchaseCost,
        p_selling_price: sellingPrice,
        p_description: description,
        p_category_id: category_id,
        p_image_url: imageUrl,
        p_barcode: barcode,
        p_attributes: attributes,
        p_tracking_mode: trackingMode,
        p_variant_image_url: null, // Assuming same image for MVP
        p_is_active: true,
        p_unit_of_measure: unitOfMeasure,
        p_packaging_type: packagingType,
        p_units_per_pack: unitsPerPack,
        p_item_size: itemSize
    })

    if (rpcError) {
      console.error('RPC Error creating product:', rpcError)
      return { error: rpcError.message || 'Failed to create product. Check SKU/Barcode uniqueness.' }
    }

    // 3. Initialize inventory for the selected store if opening stock is provided
    if (selectedStoreId && openingStockInput > 0 && data?.variant_id) {
      const baseQuantity = Math.floor(openingStockInput * (packagingType !== 'NONE' ? unitsPerPack : 1))
      
      if (baseQuantity > 0) {
        const { error: invError } = await supabase.rpc('record_inventory_movement', {
          p_store_id: selectedStoreId,
          p_variant_id: data.variant_id,
          p_movement_type: 'opening_stock',
          p_quantity: baseQuantity,
          p_reference_id: null,
          p_notes: 'Initial opening stock',
          p_disposition: 'RESELLABLE'
        })
        
        if (invError) {
          console.error('Error initializing inventory:', invError)
          return { error: `Product created, but inventory failed: ${invError.message}` }
        }
      }
    }

    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard/pos')
    return { success: true, data }
  } catch (err: unknown) {
    console.error('Action Exception:', err)
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
    return { error: errorMsg }
  }
}
