export function medicineLabel(record) {
  return `${record.genericName}${record.brandName ? ` (${record.brandName})` : ''} · ${record.strength} · ${record.dosageForm}`
}
export const MOVEMENT_LABELS = { receipt: 'Stock received', adjustment: 'Adjustment', dispense: 'Dispensed' }
