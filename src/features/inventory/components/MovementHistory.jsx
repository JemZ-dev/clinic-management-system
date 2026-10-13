import DirectorySearch from '../../../components/ui/DirectorySearch.jsx'
import PaginationControls from '../../../components/ui/PaginationControls.jsx'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Table from 'react-bootstrap/Table'
import useApiResource from '../../../hooks/useApiResource.js'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import { MOVEMENT_LABELS, medicineLabel } from '../../../lib/medicine.js'
import { formatClinicDate, formatClinicTime } from '../../../lib/clinicTime.js'

function MovementSearch({ initial, onSearch, loading }) {
  return <DirectorySearch id="movement-search" label="Search medicine name or brand" initialValue={initial} onSearch={onSearch} loading={loading} />
}
export default function MovementHistory({ medicineId }) {
  const [params, setParams] = useSearchParams()
  const [localPage, setLocalPage] = useState(1)
  const embedded = !!medicineId
  const q = embedded ? '' : params.get('q') || '', type = embedded ? 'all' : params.get('type') || 'all'
  const request = new URLSearchParams({ q, type, page: embedded ? String(localPage) : params.get('page') || '1', limit: embedded ? '10' : params.get('limit') || '10' })
  if (medicineId || params.get('medicineId')) request.set('medicineId', medicineId || params.get('medicineId'))
  if (!embedded && params.has('visitId')) request.set('visitId', params.get('visitId'))
  const resource = useApiResource(`/inventory?${request}`)
  function filter(changes) { setParams((previous) => { const next = new URLSearchParams(previous); next.set('page', '1'); for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value) } return next }) }
  const pagination = resource.data?.pagination
  return <section className="directory-panel movement-history" aria-label="Stock movement history">
    {embedded ? <div className="visit-history-heading section-heading"><h2>Stock movement history</h2><Button variant="outline-secondary" onClick={resource.reload}>Refresh history</Button></div> : <div className="directory-toolbar"><MovementSearch loading={resource.loading} initial={q} onSearch={(q) => filter({ q })} /><Form.Group controlId="movement-type-filter"><Form.Label>Movement type</Form.Label><Form.Select value={type} onChange={(event) => filter({ type: event.target.value })}><option value="all">All movements</option>{Object.entries(MOVEMENT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Form.Select></Form.Group>{(params.has('medicineId') || params.has('visitId')) && <Button variant="link" onClick={() => filter({ medicineId: null, visitId: null })}>Clear record filter</Button>}</div>}
    {resource.loading ? <AsyncState loading title="Loading stock history" message="Fetching saved movements…" /> : resource.error ? <AsyncState title="Unable to load stock history" message={resource.error} onRetry={resource.reload} /> : !resource.data.records.length ? <div className="directory-empty" role="status"><h2>{q || type !== 'all' ? 'No matching stock movements' : 'No stock movements yet'}</h2><p>Receipts, adjustments, and actual dispensing appear here after they are saved.</p></div> : <>
      <div className="table-scroll" role="region" aria-label="Stock movements table, scroll for all columns" tabIndex={0}><Table className="directory-table movement-table"><caption className="visually-hidden">Saved stock movements in newest-first order. Balances are after each movement.</caption><thead><tr><th scope="col">Recorded (Manila)</th>{!embedded && <th scope="col">Medicine</th>}<th scope="col">Type</th><th scope="col" className="numeric-cell">Change</th><th scope="col" className="numeric-cell">Balance after</th><th scope="col">Recorded by / note</th></tr></thead><tbody>{resource.data.records.map((record) => <tr key={record.id}><th scope="row">{formatClinicDate(record.createdAt)}<span className="record-meta">{formatClinicTime(record.createdAt)}</span></th>{!embedded && <td><Link to={`/medicines/${record.medicineId}`} className="table-record-label">{medicineLabel(record.medicine)}</Link></td>}<td>{MOVEMENT_LABELS[record.type]}{record.visitId && <span className="record-meta"><Link to={`/visits/${record.visitId}`}>View visit</Link></span>}</td><td className="numeric-cell">{record.quantity > 0 ? '+' : ''}{record.quantity.toLocaleString()}<span className="record-meta">{record.medicine.stockUnit}</span></td><td className="numeric-cell">{record.balanceAfter.toLocaleString()}<span className="record-meta">{record.medicine.stockUnit}</span></td><td className="movement-note">{record.author.name}{record.note && <span className="record-meta">{record.note}</span>}</td></tr>)}</tbody></Table></div>
      <div className="directory-pagination"><p role="status">{(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} movements</p>{!embedded && <Form.Group controlId="movement-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={String(pagination.limit)} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group>}<PaginationControls page={pagination.page} pages={pagination.pages} label="Stock movement pages" onPageChange={(page) => embedded ? setLocalPage(page) : filter({ page: String(page) })} /></div>
    </>}
  </section>
}
