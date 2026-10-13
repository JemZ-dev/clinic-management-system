import Button from 'react-bootstrap/Button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function PaginationControls({ page, pages, label, onPageChange }) {
  return <nav className="page-controls" aria-label={label}>
    <Button variant="outline-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={14} aria-hidden="true" />Previous</Button>
    <span>Page {page} of {pages}</span>
    <Button variant="outline-secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next<ChevronRight size={14} aria-hidden="true" /></Button>
  </nav>
}
