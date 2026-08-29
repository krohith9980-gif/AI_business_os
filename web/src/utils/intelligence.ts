export function convertBaseToPackages(
  recommendedBaseUnits: number,
  itemSize: number,
  unitsPerPack: number
) {
  // 1. Recommended physical items = CEILING(recommendedBaseUnits / itemSize)
  // Protect against division by zero
  const safeItemSize = itemSize > 0 ? itemSize : 1;
  const physicalItems = Math.ceil(recommendedBaseUnits / safeItemSize);

  // 2. Recommended purchase packages = CEILING(physicalItems / purchase_units_per_pack)
  const safeUnitsPerPack = unitsPerPack > 0 ? unitsPerPack : 1;
  const purchasePackages = Math.ceil(physicalItems / safeUnitsPerPack);

  return {
    physicalItems,
    purchasePackages
  };
}
