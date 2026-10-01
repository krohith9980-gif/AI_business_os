# Production Inventory Forensic Audit
**Project:** lhtibverxjpcvmajzazv
**Type:** READ-ONLY Verification

## PART 1 - Production Migration State
The following migrations are deployed on Production:
- **0032_worker_registration**: APPLIED
- **0033_atomic_product_creation**: APPLIED
- **0034_restore_owner**: APPLIED
- **0035_fix_inventory_stock_semantics**: NOT APPLIED
- **0036_fix_inventory_stock_semantics_v2**: NOT APPLIED
- **0037_fix_inventory_bugs**: NOT APPLIED

## PART 2 - Legacy Calculation Discrepancies
Below is the forensic analysis of EVERY active product variant currently in the Production database.

| Product Name | Product ID | Variant ID | Size | Pack | U/P | Inbound | Outbound | Theoretical | Actual | Discrepancy |
|---|---|---|---|---|---|---|---|---|---|---|
| Test Product | `77ccdbf5...` | `1b4f8926...` | 1 | NONE | 1 | 10 | 0 | **10** | **10** | **0** |
| Wisper | `27b46a98...` | `6b360d5f...` | 1 | NONE | 1 | 0 | 0 | **0** | **0** | **0** |
| ABC test | `9b85c4e1...` | `9d30616c...` | 1 | NONE | 1 | 0 | 0 | **0** | **0** | **0** |
| ABc | `ce624385...` | `f0fdafa4...` | 1 | NONE | 1 | 0 | 0 | **0** | **0** | **0** |
| 551d | `6ffb4d88...` | `61524c84...` | 1 | NONE | 1 | 0 | 0 | **0** | **0** | **0** |
| ghe | `5847bfae...` | `1923edeb...` | 1 | BOX | 9 | 162 | 8 | **154** | **154** | **0** |
| phosper | `020fcdcb...` | `ce1351a1...` | 250 | BOX | 1 | 2500 | 0 | **10** | **2500** | **2490** ⚠️ ERROR |
| Racket | `572c0a09...` | `c61d2be5...` | 1 | BOX | 21 | 65 | 2 | **63** | **63** | **0** |

### Summary
- Total Active Variants Analyzed: **8**
- Total Variants with Legacy Discrepancies: **1**

**Discovery:** The legacy `record_inventory_movement` function multiplied the quantity by `item_size` *before* inserting it into `inventory_movements`. Thus, both the ledger (`inventory_movements`) and the aggregate (`inventory_balances`) are mutually consistent, but mathematically inflated for any product where `item_size > 1`.

To repair the legacy data properly, we must fix **both** tables by dividing the quantities by `item_size`.
