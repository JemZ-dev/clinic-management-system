import { useState } from 'react'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import useApiResource from '../../../hooks/useApiResource.js'

export default function RecordPicker({ kind, label, value, selected, onChange, error }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const resource = useApiResource(`/${kind}?${new URLSearchParams({ q: query, page: String(page), limit: '10', status: 'active' })}`)
  const records = resource.data?.records || []
  const currentOutsidePage = selected && !records.some((record) => record.id === selected.id)
  const controlId = `appointment-${kind}-select`
  const patient = kind === 'patients'
  function optionText(record) { return `${record.name} · ${patient ? record.patientId : record.specialty}${record.archivedAt ? ' · Archived' : ''}` }
  return <div className="record-picker">
    <Form.Label htmlFor={controlId}>{label}<span className="required-marker"> *</span></Form.Label>
    <div className="picker-search"><Form.Control type="search" value={search} maxLength={100} aria-label={`Search ${kind}`} placeholder={`Search ${patient ? 'name or patient ID' : 'name or specialty'}`} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setQuery(search.trim()); setPage(1) } }} /><Button type="button" variant="outline-secondary" onClick={() => { setQuery(search.trim()); setPage(1) }}>Find</Button></div>
    <Form.Select id={controlId} required value={value} isInvalid={!!error} aria-describedby={error ? `${controlId}-error` : `${controlId}-help`} onChange={(event) => {
      const chosen = records.find((record) => record.id === event.target.value) || (selected?.id === event.target.value ? selected : null)
      onChange(event.target.value, chosen)
    }}>
      <option value="">Choose {patient ? 'a patient' : 'a doctor'}</option>
      {currentOutsidePage && <option value={selected.id}>{optionText(selected)}</option>}
      {records.map((record) => <option key={record.id} value={record.id}>{optionText(record)}</option>)}
    </Form.Select>
    {error && <Form.Control.Feedback type="invalid" id={`${controlId}-error`}>{error}</Form.Control.Feedback>}
    <div id={`${controlId}-help`} className="picker-feedback" aria-live="polite">
      {resource.loading ? `Loading ${kind}…` : resource.error ? <><span>{resource.error}</span><Button type="button" variant="link" onClick={resource.reload}>Try again</Button></> : records.length ? <><span>Page {resource.data.pagination.page} of {resource.data.pagination.pages}</span><div><Button type="button" variant="link" disabled={resource.data.pagination.page <= 1} onClick={() => setPage(resource.data.pagination.page - 1)} aria-label={`Previous ${kind} choices`}>Previous</Button><Button type="button" variant="link" disabled={resource.data.pagination.page >= resource.data.pagination.pages} onClick={() => setPage(resource.data.pagination.page + 1)} aria-label={`Next ${kind} choices`}>Next</Button></div></> : <span>{query ? 'No matches. Try another search.' : `No active ${kind}. Add a directory record before continuing.`}</span>}
    </div>
  </div>
}
