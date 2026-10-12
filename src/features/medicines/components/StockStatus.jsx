export default function StockStatus({ record: medicine }) {
  const label = medicine.archivedAt ? 'Archived' : medicine.quantity === 0 ? 'Out of stock' : medicine.lowStock ? 'Low stock' : 'In stock'
  return <span className={`stock-status ${medicine.archivedAt ? 'archived' : medicine.quantity === 0 ? 'out' : medicine.lowStock ? 'low' : 'available'}`}>{label}</span>
}
