import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { Plus } from 'lucide-react'
import VisitList from '../components/VisitList.jsx'

export default function VisitsPage() {
  return <><header className="page-heading"><div><h1>Visits</h1><p>Review saved consultations, treatments, and follow-up instructions.</p></div><Button as={Link} role="link" to="/visits/new"><Plus size={17} aria-hidden="true" />Record visit</Button></header><VisitList /></>
}
