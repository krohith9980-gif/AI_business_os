import re

filepath = r"c:\Users\krohi\Ai-Business-Os\web\src\app\dashboard\purchases\AIInvoiceModal.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Import addSupplier
if "addSupplier" not in content:
    content = re.sub(
        r"(import React.*?)\n",
        r"\1\nimport { addSupplier } from '../suppliers/actions'\n",
        content,
        count=1
    )

# 2. Add localSuppliers state and Supplier Creation states
state_addition = """
  // Local suppliers state for appending created supplier
  const [localSuppliers, setLocalSuppliers] = useState<Supplier[]>(suppliers)
  
  // Supplier Creation State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
  const [supplierCreationError, setSupplierCreationError] = useState<string | null>(null)
  
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSupplierName.trim() || !newSupplierPhone.trim()) {
      setSupplierCreationError('Supplier Name and Phone Number are required')
      return
    }
    
    // Check for similar name
    const existing = localSuppliers.find(s => s.name.toLowerCase() === newSupplierName.toLowerCase().trim())
    if (existing && !window.confirm(`A supplier named "${existing.name}" already exists. Are you sure you want to create a duplicate?`)) {
      return
    }

    setIsCreatingSupplier(true)
    setSupplierCreationError(null)

    try {
      const formData = new FormData()
      formData.append('name', newSupplierName.trim())
      formData.append('storeId', storeId)
      formData.append('openingBalance', '0')
      
      const attributes = {
        contact: newSupplierContact.trim(),
        phone: newSupplierPhone.trim()
      }
      formData.append('attributes', JSON.stringify(attributes))
      
      const result = await addSupplier(formData)
      if (result.error) throw new Error(result.error)
      
      const newSupplierId = result.id
      const newSupplier = { id: newSupplierId, name: newSupplierName.trim() }
      
      setLocalSuppliers(prev => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)))
      setSupplierId(newSupplierId)
      setIsSupplierModalOpen(false)
      
      // Reset forms
      setNewSupplierName('')
      setNewSupplierContact('')
      setNewSupplierPhone('')
    } catch (err: any) {
      setSupplierCreationError(err.message || 'Failed to create supplier')
    } finally {
      setIsCreatingSupplier(false)
    }
  }
"""
if "const [localSuppliers, setLocalSuppliers]" not in content:
    content = re.sub(
        r"(const \[error, setError\].*?\n)",
        r"\1" + state_addition,
        content,
        count=1
    )

# 3. Update product_name mapping in DraftItem
content = re.sub(
    r"product_name: item\.productName \|\| '',",
    r"product_name: item.fullProductIdentity || item.productName || '',",
    content
)

# 4. Redesign Top Section: Supplier
old_supplier_ui = r"""                  <div>
                    <label className="block text-sm font-medium text-gray-900">Supplier \*</label>
                    \{aiSupplierSuggestion && !supplierId && \(
                      <p className="text-xs text-indigo-600 mt-1 mb-2">AI Suggests: \{aiSupplierSuggestion\}</p>
                    \)\}
                    <select
                      value=\{supplierId\}
                      onChange=\{e => setSupplierId\(e\.target\.value\)\}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="">-- Confirm or Select Supplier --</option>
                      \{suppliers\.map\(s => <option key=\{s\.id\} value=\{s\.id\}>\{s\.name\}</option>\)\}
                    </select>
                  </div>"""

new_supplier_ui = """                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-900">Supplier *</label>
                    
                    {/* AI Recommendation Card */}
                    {aiSupplierSuggestion && !supplierId && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">AI Recommended Supplier</p>
                          <p className="text-sm font-medium text-gray-900 mt-1">{aiSupplierSuggestion}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const existing = localSuppliers.find(s => s.name.toLowerCase() === aiSupplierSuggestion.toLowerCase())
                            if (existing) {
                              setSupplierId(existing.id)
                            } else {
                              setNewSupplierName(aiSupplierSuggestion)
                              setNewSupplierContact('')
                              setNewSupplierPhone('')
                              setIsSupplierModalOpen(true)
                            }
                          }}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded shadow-sm hover:bg-indigo-700 whitespace-nowrap"
                        >
                          Use Recommended
                        </button>
                      </div>
                    )}
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={supplierId}
                        onChange={e => setSupplierId(e.target.value)}
                        required
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        <option value="">-- Select Existing Supplier --</option>
                        {localSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setNewSupplierName(aiSupplierSuggestion || '')
                          setNewSupplierContact('')
                          setNewSupplierPhone('')
                          setIsSupplierModalOpen(true)
                        }}
                        className="px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap"
                      >
                        + Create New Supplier
                      </button>
                    </div>
                  </div>"""

content = re.sub(old_supplier_ui, new_supplier_ui, content)


# 5. Add the Supplier Creation Modal
supplier_modal_ui = """
      {/* Create Supplier Popup Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Create New Supplier</h3>
              <button type="button" onClick={() => setIsSupplierModalOpen(false)} disabled={isCreatingSupplier} className="text-gray-400 hover:text-gray-600">
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateSupplier} className="p-6 space-y-4">
              {supplierCreationError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {supplierCreationError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Company Name (AI Detected)</label>
                <input
                  type="text"
                  value={aiSupplierSuggestion}
                  disabled
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-500 bg-gray-100 shadow-sm sm:text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">If this is incorrect, edit the Supplier Name below.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm placeholder:text-gray-400"
                  placeholder="E.g. SK REDDY CHEMICALS M (TS)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                <input
                  type="text"
                  value={newSupplierContact}
                  onChange={e => setNewSupplierContact(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm placeholder:text-gray-400"
                  placeholder="Contact Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={newSupplierPhone}
                  onChange={e => setNewSupplierPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm placeholder:text-gray-400"
                  placeholder="Phone Number"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  disabled={isCreatingSupplier}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSupplier}
                  className="inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {isCreatingSupplier ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Supplier'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
"""

if "Create New Supplier</h3>" not in content:
    content = content.replace("    </div>\n  )\n}", supplier_modal_ui + "    </div>\n  )\n}")


with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied to AIInvoiceModal.tsx successfully.")
