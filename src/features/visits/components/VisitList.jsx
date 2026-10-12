import DirectorySearch from '../../../components/ui/DirectorySearch.jsx'
import PaginationControls from '../../../components/ui/PaginationControls.jsx'
import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import useApiResource from '../../../hooks/useApiResource.js'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import { formatClinicDate } from '../../../lib/clinicTime.js'

function VisitSearch({ initial, onSearch }) {
  return <DirectorySearch id="visit-search" label="Search patient, patient ID, or doctor" initialValue={initial} onSearch={onSearch} />
}

export default function VisitList({ patientId, embedded = false }) {
  const [params, setParams] = useSearchParams()
  const [historyPage, setHistoryPage] = useState(1)
  const location = useLocation()
  const q = embedded ? '' : params.get('q') || ''
  const selectedPatient = patientId || params.get('patientId')
  const request = new URLSearchParams({ q, page: embedded ? String(historyPage) : params.get('page') || '1', limit: embedded ? '10' : params.get('limit') || '10' })
  if (selectedPatient) request.set('patientId', selectedPatient)
  if (!embedded && params.has('doctorId')) request.set('doctorId', params.get('doctorId'))
  const resource = useApiResource(`/visits?${request}`)
  const backTo = `${location.pathname}${location.search}`
  function filter(changes) {
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('page', '1'); for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value) } return next })
  }
  const scoped = !embedded && (params.has('patientId') || params.has('doctorId'))
  const heading = embedded ? 'Visit history' : null
  const pagination = resource.data?.pagination
  return <section className={`directory-panel ${embedded ? 'patient-visit-history' : ''}`} aria-label={embedded ? 'Patient visit history' : 'Visit directory'}>
    {heading && <div className="visit-history-heading"><h2>{heading}</h2><p>Newest visits first. Open a visit to review its notes and any corrections.</p></div>}
    {!embedded && <div className="directory-toolbar"><VisitSearch key={q} initial={q} onSearch={(value) => filter({ q: value })} />{scoped && <Button variant="link" onClick={() => filter({ patientId: null, doctorId: null })}>Clear record filter</Button>}</div>}
    {resource.loading ? <AsyncState loading title="Loading visits" message="Fetching saved visit records…" /> : resource.error ? <AsyncState title="Unable to load visits" message={resource.error} onRetry={resource.reload} /> : !resource.data.records.length ? <div className="directory-empty" role="status"><h2>{q ? 'No matching visits' : 'No visits recorded yet'}</h2><p>{q ? 'Try another patient name, patient ID, or doctor name.' : 'Saved visits will appear here, with their original details preserved.'}</p></div> : <>
      <div className="table-scroll" role="region" aria-label="Visit records" tabIndex={0}><Table className="directory-table visit-table mb-0"><thead><tr><th scope="col">Visit date</th>{!embedded && <th scope="col">Patient</th>}<th scope="col">Attending doctor</th><th scope="col">Record</th></tr></thead><tbody>{resource.data.records.map((record) => <tr key={record.id}><th scope="row">{formatClinicDate(record.date)}</th>{!embedded && <td><span className="table-record-label">{record.patient.name}</span><span className="record-meta">{record.patient.patientId}</span></td>}<td><span className="table-record-label">{record.doctor.name}</span><span className="record-meta">{record.doctor.specialty}</span></td><td><Link to={`/visits/${record.id}`} state={{ backTo }} aria-label={`View visit on ${formatClinicDate(record.date)} for ${record.patient.name}`}>View visit</Link></td></tr>)}</tbody></Table></div>
      <div className="directory-pagination"><p role="status">{(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} visits</p>{!embedded && <Form.Group controlId="visit-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={String(pagination.limit)} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group>}<PaginationControls page={pagination.page} pages={pagination.pages} label="Visit pages" onPageChange={(page) => embedded ? setHistoryPage(page) : filter({ page: String(page) })} /></div>
    </>}
  </section>
}
