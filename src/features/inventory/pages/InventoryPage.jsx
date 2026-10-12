import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import MovementHistory from '../components/MovementHistory.jsx'

export default function InventoryPage() {
  return <><header className="page-heading"><div><h1>Inventory history</h1><p>Review receipts, dispensing, and explained adjustments. Saved movements are preserved.</p></div><Button as={Link} role="link" variant="outline-secondary" to="/medicines">View current stock</Button></header><MovementHistory /></>
}
