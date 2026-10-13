import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import VisitList from '../components/VisitList.jsx'

export default function VisitsPage() {
  return <><header className="page-heading"><div><h1>Visits</h1><p>Review saved consultations, treatments, and follow-up instructions.</p></div><Button as={Link} role="link" to="/queue">Open patient queue</Button></header><VisitList /></>
}
