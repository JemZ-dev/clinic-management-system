import DirectorySearch from '../../../components/ui/DirectorySearch.jsx'
import PaginationControls from '../../../components/ui/PaginationControls.jsx'
import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { useState } from 'react'
import { Link } from 'react-router'
import Table from 'react-bootstrap/Table'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import { useAuth } from '../../../hooks/useAuth.js'
import { can } from '../../../../shared/permissions.js'
import useApiResource from '../../../hooks/useApiResource.js'
import { api } from '../../../lib/api.js'
import { WorkflowResource, WorkflowForm, Field } from './WorkflowUI.jsx'
import { money, dateTime, ORDER_STAGES } from '../workflow.js'

function OrderEditor({ record, reload, onClose }) {
  const { confirm, dialog } = useConfirmDialog()
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const choices = []
  if (can(user, 'diagnostics') && ['requested', 'scheduled'].includes(record.stage)) choices.push({ value: 'scheduled', label: 'Schedule examination' }, { value: 'performed', label: record.category === 'laboratory' ? 'Specimen collected / test performed' : 'Examination performed' })
  if (['requested', 'scheduled'].includes(record.stage)) choices.push({ value: 'cancelled', label: 'Cancel request' })
  if (can(user, 'diagnostics') && ['performed', 'result_available', 'reviewed'].includes(record.stage)) choices.push({ value: 'report', label: 'Attach report / corrected report' })
  if (can(user, 'clinical') && record.stage === 'result_available') choices.push({ value: 'reviewed', label: 'Record doctor’s review' })
  return <div className="workflow-editor">{dialog}<div className="section-heading"><h3>{record.serviceName}</h3><Button variant="link" onClick={async () => { if (await confirm('Close this test update? Unfinished entries will be discarded.', { title: 'Discard unsaved changes?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'danger' })) onClose() }}>Close</Button></div>
    <p>{record.provider || 'In-house'} · {ORDER_STAGES[record.stage]}</p>
    {record.scheduledAt && <p>Scheduled: {dateTime(record.scheduledAt)}</p>}
    {record.reports?.length > 0 && <ul>{record.reports.map((id, index) => <li key={id}><a href={`/api/operations/reports/${id}`} target="_blank" rel="noreferrer">Download report {index + 1}</a></li>)}</ul>}
    {record.reviewNote && <p className="workflow-note">Doctor’s review: {record.reviewNote}</p>}
    {choices.length > 0 && <WorkflowForm initial={{ action: choices[0].value, note: '', scheduledAt: '', provider: record.provider || '', reportDate: '' }} submitLabel="Save test update" onSave={async (values) => {
      if (values.action === 'report') {
        if (!file || file.size > 3 * 1024 * 1024) throw { response: { data: { message: 'Choose a PDF, PNG, or JPEG report of at most 3 MB.' } } }
        const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not read this report.')); reader.readAsDataURL(file) })
        await api.post(`/operations/orders/${record.id}/reports`, { version: record.version, name: file.name, mime: file.type, provider: values.provider, reportDate: values.reportDate, content })
      } else await api.patch(`/operations/orders/${record.id}`, { version: record.version, stage: values.action, note: values.note, ...(values.action === 'scheduled' ? { scheduledAt: new Date(`${values.scheduledAt}:00+08:00`).toISOString() } : {}) })
      reload(); onClose()
    }}>{({ values, change }) => <><Field label="Update" value={values.action} onChange={(value) => change('action', value)} options={choices} />{values.action === 'scheduled' && <Field label="Date and time (Manila)" type="datetime-local" required value={values.scheduledAt} onChange={(value) => change('scheduledAt', value)} />}{values.action === 'report' ? <><Field label="Report provider" required maxLength={160} value={values.provider} onChange={(value) => change('provider', value)} /><Field label="Report date" required type="date" value={values.reportDate} onChange={(value) => change('reportDate', value)} /><label className="form-label" htmlFor="diagnostic-report">Report file (PDF, PNG, JPEG; maximum 3 MB)</label><input id="diagnostic-report" type="file" className="form-control" accept="application/pdf,image/png,image/jpeg" required onChange={(event) => setFile(event.target.files[0])} /></> : <Field label={values.action === 'reviewed' ? 'Review note' : 'Note / cancellation reason'} multiline maxLength={2000} required={['reviewed', 'cancelled'].includes(values.action)} value={values.note} onChange={(value) => change('note', value)} />}</>}</WorkflowForm>}
    {record.history && <details className="workflow-details"><summary>Request history</summary><ol>{record.history.map((entry, index) => <li key={index}>{entry.action.replaceAll('_', ' ')} · {entry.actor.name} · {dateTime(entry.at)}{entry.note && ` — ${entry.note}`}</li>)}</ol></details>}
  </div>
}
export default function OrdersPanel({ encounter }) {
  const { confirm, dialog } = useConfirmDialog()
  const { user } = useAuth()
  const [filters, setFilters] = useState({ q: '', status: 'all', category: 'all', provider: 'all', from: '', through: '', page: '1', limit: '10' })
  function filter(values) { setFilters((previous) => ({ ...previous, page: '1', ...values })) }
  const query = new URLSearchParams({ ...filters, ...(encounter ? { encounterId: encounter.id } : {}) })
  const resource = useApiResource(`/operations/orders?${query}`)
  const catalog = useApiResource('/operations/services')
  const [selected, setSelected] = useState(null), [adding, setAdding] = useState(false)
  const [duplicate, setDuplicate] = useState(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const canAdd = encounter && (can(user, 'clinical') || (can(user, 'reception') && encounter.kind === 'external_test')) && encounter.stage !== 'left'
  return <>{dialog}<div className="section-heading"><h2>Diagnostic requests</h2>{canAdd && !adding && !selected && <Button onClick={() => { setRequestId(crypto.randomUUID()); setDuplicate(null); setAdding(true) }}>Request test</Button>}</div><p className="section-description">Test progress and payment are tracked separately. External-provider fees are not added to the clinic bill.</p>
    {adding && <div className="workflow-editor"><WorkflowResource resource={catalog}>{({ records }) => <WorkflowForm initial={{ serviceId: '', repeatAcknowledged: false, repeatReason: '' }} submitLabel="Create test request" onSave={async (values) => {
      try {
        await api.post('/operations/orders', { serviceId: values.serviceId, encounterId: encounter.id, requestId, ...(values.repeatAcknowledged && duplicate ? { repeatAcknowledged: true, repeatOf: duplicate.id, repeatReason: values.repeatReason } : {}) })
        setAdding(false); resource.reload()
      } catch (failure) { setDuplicate(failure.response?.data?.duplicateOrder || null); throw failure }
    }}>{({ values, change }) => <>
      <Field label="Diagnostic service" required value={values.serviceId} onChange={(value) => { change('serviceId', value); change('repeatAcknowledged', false); change('repeatReason', ''); setDuplicate(null) }} options={[{ value: '', label: 'Select service' }, ...records.filter((service) => service.active && ['laboratory', 'imaging', 'diagnostic'].includes(service.category)).map((service) => ({ value: service.id, label: `${service.name} · ${service.external ? `External: ${service.provider}` : money(service.priceCentavos)}` }))]} />
      {duplicate && <Alert variant="warning"><p><strong>This test is already pending.</strong> {duplicate.serviceName} · {ORDER_STAGES[duplicate.stage]} · {dateTime(duplicate.createdAt)}</p><Link to={`/queue/${duplicate.encounterId}?tab=tests`}>View existing request</Link>
        {can(user, 'clinical') ? <><Form.Check id="confirm-repeat-test" className="mt-3" label="I confirm this repeat test is intentional" checked={values.repeatAcknowledged} onChange={(event) => { change('repeatAcknowledged', event.target.checked); change('repeatReason', '') }} />{values.repeatAcknowledged && <Field label="Reason for repeat test" multiline required minLength={5} maxLength={500} value={values.repeatReason} onChange={(value) => change('repeatReason', value)} />}</> : <p className="mt-3 mb-0">A doctor must authorize an intentional repeat test.</p>}
      </Alert>}
    </>}</WorkflowForm>}</WorkflowResource><Button variant="link" onClick={async () => { if (await confirm('Discard this unfinished test request?', { title: 'Discard unsaved changes?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'danger' })) setAdding(false) }}>Cancel request</Button></div>}
    {selected && <OrderEditor key={selected.id} record={selected} reload={resource.reload} onClose={() => setSelected(null)} />}
    <fieldset disabled={adding || !!selected} className="diagnostic-filters directory-toolbar">
      <DirectorySearch id={`diagnostic-search-${encounter?.id || 'all'}`} label="Search patient name, ID, or test" initialValue={filters.q} onSearch={(q) => filter({ q })} loading={resource.loading} />
      <Form.Group controlId="diagnostic-status"><Form.Label>Status</Form.Label><Form.Select value={filters.status} onChange={(event) => filter({ status: event.target.value })}><option value="all">All statuses</option>{Object.entries(ORDER_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>
      <Form.Group controlId="diagnostic-category"><Form.Label>Category</Form.Label><Form.Select value={filters.category} onChange={(event) => filter({ category: event.target.value })}>{[['all', 'All categories'], ['laboratory', 'Laboratory'], ['imaging', 'Imaging'], ['diagnostic', 'Diagnostic']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>
      <Form.Group controlId="diagnostic-provider"><Form.Label>Provider</Form.Label><Form.Select value={filters.provider} onChange={(event) => filter({ provider: event.target.value })}><option value="all">All providers</option><option value="in_house">In-house</option><option value="external">External</option></Form.Select></Form.Group>
      <Form.Group controlId="diagnostic-from"><Form.Label>Requested from</Form.Label><Form.Control type="date" value={filters.from} max={filters.through || undefined} onChange={(event) => filter({ from: event.target.value })} /></Form.Group>
      <Form.Group controlId="diagnostic-through"><Form.Label>Requested through</Form.Label><Form.Control type="date" value={filters.through} min={filters.from || undefined} onChange={(event) => filter({ through: event.target.value })} /></Form.Group>
      <Button type="button" variant="outline-secondary" onClick={() => setFilters({ q: '', status: 'all', category: 'all', provider: 'all', from: '', through: '', page: '1', limit: '10' })}>Clear filters</Button>
    </fieldset>
    <WorkflowResource resource={resource}>{({ records, pagination = { page: 1, pages: 1, total: records.length } }) => <>{records.length ? <Table responsive hover><thead><tr>{!encounter && <th>Patient</th>}<th>Service</th><th>Provider / price</th><th>Status</th><th>Action</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>{!encounter && <td>{record.patientName}<span className="record-meta">{record.patientNumber}</span></td>}<td>{record.serviceName}<span className="record-meta">{dateTime(record.createdAt)}</span></td><td>{record.external ? record.provider : money(record.priceCentavos)}</td><td>{ORDER_STAGES[record.stage]}{record.stage === 'cancelled' && !record.external && <span className="record-meta">Reconcile charge in billing</span>}</td><td>{(can(user, 'clinical') || can(user, 'diagnostics')) && <Button variant="link" disabled={adding || !!selected} onClick={() => setSelected(record)}>Open</Button>}{!encounter && <Link to={`/queue/${record.encounterId}?tab=tests`}>Encounter</Link>}</td></tr>)}</tbody></Table> : <div className="directory-empty"><h3>No matching test requests</h3><p>Change or clear the filters to see other requests.</p></div>}<div className="directory-pagination"><p role="status">{pagination.total} diagnostic requests</p><Form.Group controlId="diagnostic-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select disabled={adding || !!selected} value={filters.limit} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group>{!adding && !selected && <PaginationControls label="Diagnostic pages" page={pagination.page} pages={pagination.pages} onPageChange={(page) => filter({ page: String(page) })} />}</div></>}</WorkflowResource>
  </>
}
