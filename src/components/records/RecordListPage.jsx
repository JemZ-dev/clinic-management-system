import { Access } from '../ui/Access.jsx'
import DirectorySearch from '../ui/DirectorySearch.jsx'
import PaginationControls from '../ui/PaginationControls.jsx'
import { Link, useLocation, useSearchParams } from 'react-router'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Table from 'react-bootstrap/Table'
import { Plus } from 'lucide-react'
import useApiResource from '../../hooks/useApiResource.js'
import AsyncState from '../ui/AsyncState.jsx'
import ArchivedLabel from '../ui/ArchivedLabel.jsx'

function SearchForm({ query, onSearch, label, loading }) {
  return <DirectorySearch id="directory-search" label={label} initialValue={query} onSearch={onSearch} loading={loading} />
}

export default function RecordListPage({ config }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const query = params.get('q') || ''
  const status = ['active', 'archived', 'all'].includes(params.get('status')) ? params.get('status') : 'active'
  const limit = ['10', '25', '50'].includes(params.get('limit')) ? params.get('limit') : '10'
  const page = /^[1-9]\d{0,4}$/.test(params.get('page') || '') ? params.get('page') : '1'
  const requestParams = new URLSearchParams({ q: query, status, limit, page })
  const resource = useApiResource(`/${config.kind}?${requestParams}`)
  const patient = config.kind === 'patients'
  function filter(changes) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('page', '1')
      for (const [name, value] of Object.entries(changes)) { if (value) next.set(name, value); else next.delete(name) }
      return next
    })
  }
  const backTo = `${location.pathname}${location.search}`
  return <>
    <header className="page-heading"><div><h1>{config.title}</h1><p>{config.description}</p></div><Access permission={config.kind === 'patients' ? 'reception' : 'accounts'}><Button as={Link} to={`/${config.kind}/new`} state={{ backTo }}><Plus size={17} aria-hidden="true" />Add {config.singular}</Button></Access></header>
    {location.state?.notice && <Alert variant="success" role="status">{location.state.notice}</Alert>}
    <section className="directory-panel" aria-label={`${config.title} directory`}>
      <div className="directory-toolbar">
        <SearchForm query={query} onSearch={(q) => filter({ q })} label={config.searchLabel} loading={resource.loading} />
        <Form.Group controlId="directory-status"><Form.Label>Records</Form.Label><Form.Select value={status} onChange={(event) => filter({ status: event.target.value })}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></Form.Select></Form.Group>
      </div>
      {resource.loading ? <AsyncState loading title={`Loading ${config.kind}`} message="Fetching the latest records…" /> : resource.error ? <AsyncState title="Unable to load records" message={resource.error} onRetry={resource.reload} /> : resource.data.records.length === 0 ?
        <div className="directory-empty" role="status"><h2>{query ? 'No matching records' : status === 'archived' ? 'No archived records' : config.emptyTitle}</h2><p>{query ? 'Try a different name or clear your search.' : status === 'archived' ? 'Archived records will appear here and can be restored.' : config.emptyMessage}</p>{query ? <Button variant="outline-secondary" onClick={() => filter({ q: '' })}>Clear search</Button> : status !== 'archived' && <Access permission={config.kind === 'patients' ? 'reception' : 'accounts'}><Button as={Link} to={`/${config.kind}/new`} state={{ backTo }}>Add {config.singular}</Button></Access>}</div> : <>
        <div className="table-scroll" role="region" aria-label={`${config.title} table, scroll horizontally for all columns`} tabIndex={0}>
          <Table className="directory-table"><caption className="visually-hidden">{config.title}: {status} records{query ? ` matching ${query}` : ''}</caption><thead><tr><th scope="col">{patient ? 'Patient' : 'Doctor'}</th><th scope="col">{patient ? 'Birth date' : 'Specialty'}</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>{resource.data.records.map((record) => <tr key={record.id}><th scope="row"><Link to={`/${config.kind}/${record.id}`} state={{ backTo }} className="record-name">{record.name}</Link>{patient && <span className="record-meta">{record.patientId}</span>}</th><td>{patient ? record.dateOfBirth : record.specialty}</td><td><span className="contact-line">{record.phone || 'Phone not recorded'}</span>{record.email && <span className="record-meta contact-email">{record.email}</span>}</td><td><span className={`record-status ${record.archivedAt ? 'archived' : ''}`}>{record.archivedAt ? <ArchivedLabel /> : 'Active'}</span></td><td><Link className="inline-action" to={`/${config.kind}/${record.id}`} state={{ backTo }} aria-label={`View ${record.name}`}>View</Link></td></tr>)}</tbody>
          </Table>
        </div>
        <div className="directory-pagination"><p role="status">{(resource.data.pagination.page - 1) * resource.data.pagination.limit + 1}–{Math.min(resource.data.pagination.page * resource.data.pagination.limit, resource.data.pagination.total)} of {resource.data.pagination.total} {config.kind}</p>
          <Form.Group controlId="directory-limit" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={limit} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group>
          <PaginationControls page={resource.data.pagination.page} pages={resource.data.pagination.pages} label={config.title + " pages"} onPageChange={(page) => filter({ page: String(page) })} />
        </div>
      </>}
    </section>
  </>
}
