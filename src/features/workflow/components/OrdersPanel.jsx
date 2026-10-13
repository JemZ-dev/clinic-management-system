import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { useState } from 'react'
import { Link } from 'react-router'
import Table from 'react-bootstrap/Table'
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
        if (!file || file.size > 5 * 1024 * 1024) throw { response: { data: { message: 'Choose a PDF, PNG, or JPEG report of at most 5 MB.' } } }
        const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not read this report.')); reader.readAsDataURL(file) })
        await api.post(`/operations/orders/${record.id}/reports`, { version: record.version, name: file.name, mime: file.type, provider: values.provider, reportDate: values.reportDate, content })
      } else await api.patch(`/operations/orders/${record.id}`, { version: record.version, stage: values.action, note: values.note, ...(values.action === 'scheduled' ? { scheduledAt: new Date(`${values.scheduledAt}:00+08:00`).toISOString() } : {}) })
      reload(); onClose()
    }}>{({ values, change }) => <><Field label="Update" value={values.action} onChange={(value) => change('action', value)} options={choices} />{values.action === 'scheduled' && <Field label="Date and time (Manila)" type="datetime-local" required value={values.scheduledAt} onChange={(value) => change('scheduledAt', value)} />}{values.action === 'report' ? <><Field label="Report provider" required maxLength={160} value={values.provider} onChange={(value) => change('provider', value)} /><Field label="Report date" required type="date" value={values.reportDate} onChange={(value) => change('reportDate', value)} /><label className="form-label" htmlFor="diagnostic-report">Report file (PDF, PNG, JPEG; maximum 5 MB)</label><input id="diagnostic-report" type="file" className="form-control" accept="application/pdf,image/png,image/jpeg" required onChange={(event) => setFile(event.target.files[0])} /></> : <Field label={values.action === 'reviewed' ? 'Review note' : 'Note / cancellation reason'} multiline maxLength={2000} required={['reviewed', 'cancelled'].includes(values.action)} value={values.note} onChange={(value) => change('note', value)} />}</>}</WorkflowForm>}
    {record.history && <details className="workflow-details"><summary>Request history</summary><ol>{record.history.map((entry, index) => <li key={index}>{entry.action.replaceAll('_', ' ')} · {entry.actor.name} · {dateTime(entry.at)}{entry.note && ` — ${entry.note}`}</li>)}</ol></details>}
  </div>
}
export default function OrdersPanel({ encounter }) {
  const { confirm, dialog } = useConfirmDialog()
  const { user } = useAuth()
  const resource = useApiResource(`/operations/orders${encounter ? `?encounterId=${encounter.id}` : ''}`)
  const catalog = useApiResource('/operations/services')
  const [selected, setSelected] = useState(null), [adding, setAdding] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const canAdd = encounter && (can(user, 'clinical') || (can(user, 'reception') && encounter.kind === 'external_test')) && encounter.stage !== 'left'
  return <>{dialog}<div className="section-heading"><h2>Diagnostic requests</h2>{canAdd && !adding && !selected && <Button onClick={() => { setRequestId(crypto.randomUUID()); setAdding(true) }}>Request test</Button>}</div><p className="section-description">Test progress and payment are tracked separately. External-provider fees are not added to the clinic bill.</p>
    {adding && <div className="workflow-editor"><WorkflowResource resource={catalog}>{({ records }) => <WorkflowForm initial={{ serviceId: '' }} submitLabel="Create test request" onSave={async (values) => { await api.post('/operations/orders', { ...values, encounterId: encounter.id, requestId }); setAdding(false); resource.reload() }}>{({ values, change }) => <Field label="Diagnostic service" required value={values.serviceId} onChange={(value) => change('serviceId', value)} options={[{ value: '', label: 'Select service' }, ...records.filter((service) => service.active && ['laboratory', 'imaging', 'diagnostic'].includes(service.category)).map((service) => ({ value: service.id, label: `${service.name} · ${service.external ? `External: ${service.provider}` : money(service.priceCentavos)}` }))]} />}</WorkflowForm>}</WorkflowResource><Button variant="link" onClick={async () => { if (await confirm('Discard this unfinished test request?', { title: 'Discard unsaved changes?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'danger' })) setAdding(false) }}>Cancel request</Button></div>}
    {selected && <OrderEditor key={selected.id} record={selected} reload={resource.reload} onClose={() => setSelected(null)} />}
    <WorkflowResource resource={resource}>{({ records }) => records.length ? <Table responsive hover><thead><tr>{!encounter && <th>Patient</th>}<th>Service</th><th>Provider / price</th><th>Status</th><th>Action</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>{!encounter && <td>{record.patientName}<span className="record-meta">{record.patientNumber}</span></td>}<td>{record.serviceName}<span className="record-meta">{dateTime(record.createdAt)}</span></td><td>{record.external ? record.provider : money(record.priceCentavos)}</td><td>{ORDER_STAGES[record.stage]}{record.stage === 'cancelled' && !record.external && <span className="record-meta">Reconcile charge in billing</span>}</td><td>{(can(user, 'clinical') || can(user, 'diagnostics')) && <Button variant="link" disabled={adding || !!selected} onClick={() => setSelected(record)}>Open</Button>}{!encounter && <Link to={`/queue/${record.encounterId}?tab=tests`}>Encounter</Link>}</td></tr>)}</tbody></Table> : <div className="directory-empty"><h3>No test requests</h3><p>Tests requested for this patient will appear here.</p></div>}</WorkflowResource>
  </>
}
