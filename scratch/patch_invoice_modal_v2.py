import re

file_path = r'c:\Users\krohi\Ai-Business-Os\web\src\app\dashboard\purchases\AIInvoiceModal.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update useState import to include useTransition if missing
if 'useTransition' not in content:
    content = re.sub(r'import React, \{\s*useState,\s*useRef,\s*useMemo\s*\} from \'react\'', 
                     'import React, { useState, useRef, useMemo, useTransition } from \'react\'', content)

# 2. Add useTransition hook
if 'const [isPending, startTransition] = useTransition()' not in content:
    content = re.sub(
        r'const \[isSubmitting,\s*setIsSubmitting\]\s*=\s*useState\(false\)',
        'const [isSubmitting, setIsSubmitting] = useState(false)\n  const [isPending, startTransition] = useTransition()',
        content
    )

# 3. Change amountPaid state to string
content = re.sub(
    r'const \[amountPaid, setAmountPaid\] = useState<number>\(0\)',
    'const [amountPaid, setAmountPaid] = useState<string>(\'\')',
    content
)

# 4. Update amountPaid initialization in handleUploadSuccess
content = re.sub(
    r'setAmountPaid\(0\)',
    'setAmountPaid(\'\')',
    content
)

# 5. Update handlePaymentStatusChange
content = re.sub(
    r'const handlePaymentStatusChange = \(status: \'CREDIT\' \| \'PARTIALLY_PAID\' \| \'PAID\'\) => \{\n\s*setPaymentStatus\(status\)\n\s*if \(status === \'CREDIT\'\) setAmountPaid\(0\)\n\s*if \(status === \'PAID\'\) setAmountPaid\(finalPayable\)\n\s*if \(status === \'PARTIALLY_PAID\' && amountPaid === 0\) setAmountPaid\(0\)\n\s*\}',
    '''const handlePaymentStatusChange = (status: 'CREDIT' | 'PARTIALLY_PAID' | 'PAID') => {
    setPaymentStatus(status)
    if (status === 'CREDIT') setAmountPaid('')
    if (status === 'PAID') setAmountPaid(finalPayable.toString())
    if (status === 'PARTIALLY_PAID') setAmountPaid('')
  }''',
    content
)

# 6. Update handleSubmit logic
submit_logic = '''
    const parsedAmountPaid = paymentStatus === 'CREDIT' ? 0 : (parseFloat(amountPaid) || 0)

    // Validate Financials
    if (invoiceDiscount < 0 || calculatedAdditionalDiscount < 0) return setError('Discounts cannot be negative.')
    if (taxTotal < 0) return setError('Tax cannot be negative.')
    if (parsedAmountPaid < 0) return setError('Amount paid cannot be negative.')
    if (parsedAmountPaid > finalPayable) return setError('Amount paid cannot exceed final payable amount.')
    if (paymentStatus === 'PAID' && parsedAmountPaid !== finalPayable) return setError('PAID status requires amount paid to equal final payable.')
    if (paymentStatus === 'CREDIT' && parsedAmountPaid !== 0) return setError('CREDIT status requires amount paid to be 0.')
    if (paymentStatus === 'PARTIALLY_PAID' && (parsedAmountPaid <= 0 || parsedAmountPaid >= finalPayable)) return setError('PARTIALLY PAID requires amount between 0 and final payable.')

    setIsSubmitting(true)
    
    startTransition(async () => {
      try {
        const payload: InvoicePurchaseItem[] = selectedItems.map(item => ({
          is_new: item.is_new,
          variant_id: item.is_new ? undefined : item.matched_variant_id,
          product_name: item.is_new ? item.product_name : undefined,
          sku: item.is_new ? item.sku : undefined,
          barcode: item.is_new ? item.barcode : undefined,
          purchase_cost: item.purchase_cost,
          sale_cost: Number(item.sale_cost),
          quantity: item.quantity,
          package_quantity: item.package_quantity,
          package_unit: item.package_unit,
          units_per_package: item.units_per_package,
          gross_purchase_cost: item.gross_purchase_cost || item.purchase_cost,
          discount_percentage: item.discount_percentage,
          discount_amount: item.discount_amount,
          attributes: item.raw_ai_data
        }))

        const result = await createInvoicePurchaseOrder(
          storeId, 
          supplierId, 
          idempotencyKey, 
          payload,
          invoiceDiscount,
          calculatedAdditionalDiscount,
          taxTotal,
          parsedAmountPaid,
          paymentMethod,
          '',
          roundOff
        )
        
        if (result.error) throw new Error(result.error)
        onSuccess()
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Failed to save purchase')
      } finally {
        setIsSubmitting(false)
      }
    })
  }
'''

content = re.sub(
    r'// Validate Financials\n\s*if \(invoiceDiscount < 0 \|\| calculatedAdditionalDiscount < 0\).*?finally \{\n\s*setIsSubmitting\(false\)\n\s*\}\n\s*\}',
    submit_logic.strip(),
    content,
    flags=re.DOTALL
)

# 7. Update input field
input_field_pattern = r'<input\s*type="number" min="0.01" step="0.01" max=\{finalPayable\}\s*value=\{amountPaid\}\s*onChange=\{e => setAmountPaid\(parseFloat\(e.target.value\) \|\| 0\)\}\s*disabled=\{paymentStatus === \'PAID\'\}\s*className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100"\s*/>'

new_input_field = '''<input
                          type="number" min="0.01" step="0.01" max={finalPayable}
                          value={amountPaid}
                          placeholder="0"
                          onChange={e => setAmountPaid(e.target.value)}
                          disabled={paymentStatus === 'PAID'}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100"
                        />'''

content = re.sub(input_field_pattern, new_input_field, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")
