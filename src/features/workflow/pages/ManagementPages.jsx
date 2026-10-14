import WeeklyScheduleCalendar from '../components/WeeklyScheduleCalendar.jsx'
import EmployeeInvitations, { InvitationResult } from '../components/EmployeeInvitations.jsx'
import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import PaginationControls from '../../../components/ui/PaginationControls.jsx'
import Button from 'react-bootstrap/Button'
import Table from 'react-bootstrap/Table'
import Form from 'react-bootstrap/Form'
import { useAuth } from '../../../hooks/useAuth.js'
import { can, ROLE_LABELS, EXTRA_PERMISSIONS } from '../../../../shared/permissions.js'
import useApiResource from '../../../hooks/useApiResource.js'
import { api } from '../../../lib/api.js'
import RecordPicker from '../../appointments/components/RecordPicker.jsx'
import DirectorySearch from '../../../components/ui/DirectorySearch.jsx'
import { WorkflowForm, WorkflowResource, Field } from '../components/WorkflowUI.jsx'
import OrdersPanel from '../components/OrdersPanel.jsx'
import { money, cents, dateTime } from '../workflow.js'

export function ServicesPage() {
  const { confirm, dialog } = useConfirmDialog()
  const { user } = useAuth(), [q, setQ] = useState(''), [editing, setEditing] = useState(null)
  const resource = useApiResource(`/operations/services?q=${encodeURIComponent(q)}`)
  return <>{dialog}<header className="page-heading"><div><h1>Services & pricing</h1><p>Clinic-approved fees, preparation instructions, and diagnostic providers.</p></div>{can(user, 'catalog') && !editing && <Button onClick={() => setEditing({})}>Add service</Button>}</header>
    {editing && <section className="workspace-section"><h2>{editing.id ? 'Edit service' : 'New service'}</h2><WorkflowForm initial={{ code: editing.code || '', name: editing.name || '', category: editing.category || 'laboratory', price: editing.id ? (editing.priceCentavos / 100).toFixed(2) : '', external: editing.external || false, provider: editing.provider || '', preparation: editing.preparation || '', active: editing.active !== false }} onSave={async ({ price, ...values }) => { const payload = { ...values, priceCentavos: cents(price) }; if (editing.id) await api.patch(`/operations/services/${editing.id}`, { ...payload, version: editing.version }); else await api.post('/operations/services', payload); setEditing(null); resource.reload() }}>{({ values, change, fields }) => <><div className="record-form-grid"><Field label="Service code" required maxLength={30} value={values.code} error={fields.code} onChange={(value) => change('code', value)} /><Field label="Service name / exact variant" required maxLength={160} value={values.name} onChange={(value) => change('name', value)} /><Field label="Category" value={values.category} onChange={(value) => change('category', value)} options={['consultation', 'laboratory', 'imaging', 'diagnostic', 'procedure']} /><Field label={values.external ? 'Reference price (PHP)' : 'Clinic price (PHP)'} required type="number" min="0" max="1000000" step="0.01" value={values.price} onChange={(value) => change('price', value)} /><Field label="Provider name" required={values.external} maxLength={160} value={values.provider} onChange={(value) => change('provider', value)} /><Field label="Preparation instructions" multiline maxLength={2000} value={values.preparation} onChange={(value) => change('preparation', value)} /></div><Form.Check id="service-external" label="Performed by an external provider (not billed by this clinic)" checked={values.external} onChange={(event) => change('external', event.target.checked)} /><Form.Check id="service-active" label="Available for new requests" checked={values.active} onChange={(event) => change('active', event.target.checked)} /></>}</WorkflowForm><Button variant="link" onClick={async () => { if (await confirm('Discard unfinished service changes?', { title: 'Discard unsaved changes?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'danger' })) setEditing(null) }}>Cancel</Button></section>}
    <section className="directory-panel" aria-label="Service directory">
      <div className="directory-toolbar"><DirectorySearch id="service-search" label="Search services" initialValue={q} onSearch={setQ} loading={resource.loading} /></div>
      <WorkflowResource resource={resource}>{({ records }) => <>
        {records.length ? <div className="table-scroll" role="region" aria-label="Services and pricing table, scroll horizontally for all columns" tabIndex={0}>
          <Table className="directory-table services-table"><caption className="visually-hidden">Clinic services, prices, providers, and availability.</caption>
            <thead><tr><th scope="col">Service</th><th scope="col">Category</th><th scope="col" className="numeric-cell">Price</th><th scope="col">Provider</th><th scope="col">Availability</th>{can(user, 'catalog') && <th scope="col"><span className="visually-hidden">Actions</span></th>}</tr></thead>
            <tbody>{records.map((record) => <tr key={record.id}>
              <th scope="row"><span className="table-record-label">{record.name}</span><span className="record-meta">{record.code}</span>{record.preparation && <details className="service-preparation"><summary>Preparation</summary><p>{record.preparation}</p></details>}</th>
              <td>{record.category.charAt(0).toUpperCase() + record.category.slice(1)}</td>
              <td className="numeric-cell">{money(record.priceCentavos)}{record.external && <span className="record-meta">Reference only</span>}</td>
              <td><span className="table-record-label">{record.external ? record.provider : 'In-house'}</span></td>
              <td><span className={`record-status${record.active ? '' : ' archived'}`}>{record.active ? 'Available' : 'Unavailable'}</span></td>
              {can(user, 'catalog') && <td><Button variant="link" className="inline-action p-0" aria-label={`Edit ${record.name}`} disabled={!!editing} onClick={() => setEditing(record)}>Edit</Button></td>}
            </tr>)}</tbody>
          </Table>
        </div> : <div className="directory-empty" role="status"><h2>{q ? 'No matching services' : 'No services listed'}</h2><p>{q ? 'Try another name or clear your search.' : 'An administrator can add the clinic’s services and approved prices.'}</p></div>}
        <div className="directory-pagination"><p role="status">{records.length} {records.length === 1 ? 'service' : 'services'}</p></div>
      </>}</WorkflowResource>
    </section></>
}
export function AccountsPage() {
  const { confirm, dialog } = useConfirmDialog()
  const resource = useApiResource('/operations/accounts'), { user, setUser } = useAuth()
  const [editing, setEditing] = useState(null), [doctor, setDoctor] = useState(null), [invitation, setInvitation] = useState(null)
  const [invitationRevision, setInvitationRevision] = useState(0)
  return <>{dialog}<header className="page-heading"><div><h1>Employee accounts</h1><p>Invite employees, assign responsibilities, and deactivate access.</p></div>{!editing && <Button onClick={() => { setEditing({}); setDoctor(null); setInvitation('') }}>Invite employee</Button>}</header>
    {invitation && <InvitationResult key={invitation.code} invitation={invitation} />}
    {editing && <section className="workspace-section"><h2>{editing.id ? editing.name : 'Invite employee'}</h2><WorkflowForm submitLabel={editing.id ? 'Save access changes' : 'Create invitation'} initial={{ email: '', role: editing.role || 'staff', permissions: editing.permissions || [], doctorId: editing.doctorId || '', doctorMode: 'new', doctorName: '', specialty: '', doctorPhone: '', active: editing.active !== false }} onSave={async (values) => {
      const payload = { role: values.role, permissions: values.permissions, doctorId: values.role === 'doctor' ? values.doctorId : '' }
      if (editing.id) { const { data } = await api.patch(`/operations/accounts/${editing.id}`, { ...payload, active: values.active, version: editing.version }); if (editing.id === user.id) setUser(data.record) }
      else { const newDoctor = values.role === 'doctor' && values.doctorMode === 'new' ? { name: values.doctorName, specialty: values.specialty, phone: values.doctorPhone } : undefined; const { data } = await api.post('/operations/invitations', { ...payload, doctorId: newDoctor ? '' : payload.doctorId, email: values.email, ...(newDoctor ? { newDoctor } : {}) }); setInvitation({ code: data.code, email: values.email, role: values.role }); setInvitationRevision((current) => current + 1) }
      setEditing(null); resource.reload()
    }}>{({ values, change, fields }) => <>{!editing.id && <Field label="Employee email" required type="email" maxLength={254} error={fields.email} value={values.email} onChange={(value) => change('email', value)} />}<Field label="Role" disabled={editing.id === user.id} value={values.role} onChange={(value) => change('role', value)} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />{values.role === 'doctor' && <>{!editing.id && <Field label="Doctor details" value={values.doctorMode} onChange={(value) => change('doctorMode', value)} options={[{ value: 'existing', label: 'Link an existing doctor' }, { value: 'new', label: 'Create a new doctor' }]} />}{!editing.id && values.doctorMode === 'new' ? <div className="record-form-grid"><Field label="Doctor full name" required minLength={2} maxLength={100} value={values.doctorName} error={fields['newDoctor.name']} onChange={(value) => change('doctorName', value)} /><Field label="Specialty" required minLength={2} maxLength={100} value={values.specialty} error={fields['newDoctor.specialty']} onChange={(value) => change('specialty', value)} /><Field label="Doctor phone number" type="tel" maxLength={11} value={values.doctorPhone} error={fields['newDoctor.phone']} onChange={(value) => change('doctorPhone', value)} help="Optional. The invitation email will also be used in the doctor directory." /></div> : <RecordPicker kind="doctors" label="Doctor directory record" selected={doctor} value={values.doctorId} error={fields.doctorId} onChange={(value, record) => { change('doctorId', value); setDoctor(record) }} />}</>}<p className="mt-3 mb-2">Additional responsibilities</p>{EXTRA_PERMISSIONS.map((permission) => <Form.Check key={permission} id={`permission-${permission}`} label={{ assess: 'Record initial assessments', diagnostics: 'Process diagnostic requests and reports', dispense: 'Manage medicine stock and dispensing' }[permission]} disabled={permission === 'dispense' && values.role === 'admin'} checked={(permission === 'dispense' && values.role === 'admin') || values.permissions.includes(permission)} onChange={(event) => change('permissions', event.target.checked ? [...values.permissions, permission] : values.permissions.filter((item) => item !== permission))} />)}{editing.id && <Form.Check className="mt-3" id="account-active" label="Account active" disabled={editing.id === user.id} checked={values.active} onChange={(event) => change('active', event.target.checked)} />}</>}</WorkflowForm><Button variant="link" onClick={async () => { if (await confirm('Discard unfinished account changes?', { title: 'Discard unsaved changes?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'danger' })) setEditing(null) }}>Cancel</Button></section>}
    <div className="section-heading"><h2>Employees</h2></div><section className="directory-panel" aria-label="Employee account directory">
      <WorkflowResource resource={resource}>{({ records }) => <>
        {records.length ? <div className="table-scroll" role="region" aria-label="Employee accounts table, scroll horizontally for all columns" tabIndex={0}>
          <Table className="directory-table accounts-table">
            <caption className="visually-hidden">Employee roles, additional permissions, and account access.</caption>
            <thead><tr><th scope="col">Employee</th><th scope="col">Role</th><th scope="col">Additional permissions</th><th scope="col">Access</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>{records.map((record) => <tr key={record.id}>
              <th scope="row"><span className="table-record-label">{record.name}</span><span className="record-meta contact-email">{record.email}</span>{record.id === user.id && <span className="record-meta">Your account · administrator role and active access are protected.</span>}</th>
              <td>{ROLE_LABELS[record.role]}</td>
              <td><span className="table-record-label">{record.permissions.join(', ') || 'None'}</span></td>
              <td><span className={`record-status${record.active ? '' : ' archived'}`}>{record.active ? 'Active' : 'Inactive'}</span></td>
              <td><Button variant="link" className="inline-action p-0" aria-label={`Manage account for ${record.name}`} disabled={!!editing} onClick={() => { setEditing(record); setDoctor(null); setInvitation('') }}>Manage</Button></td>
            </tr>)}</tbody>
          </Table>
        </div> : <div className="directory-empty" role="status"><h2>No employee accounts</h2><p>Invite an employee to create their clinic account.</p></div>}
        <div className="directory-pagination"><p role="status">{records.length} employee {records.length === 1 ? 'account' : 'accounts'}</p></div>
      </>}</WorkflowResource>
    </section>
    <EmployeeInvitations revision={invitationRevision} onCode={setInvitation} />
  </>
}
function ScheduleEditor({ doctor, record, reload }) {
  return <WorkflowForm initial={{ weekly: record?.weekly || [], leave: record?.leave || [] }} submitLabel="Save schedule" onSave={async (values) => { await api.put(`/operations/schedules/${doctor.id}`, { ...values, ...(record ? { version: record.version } : {}) }); reload() }}>{({ values, change }) => {
    return <><h2>{doctor.name}</h2><p className="section-description">All times are in Manila time. Bookings require configured hours; existing conflicting bookings must be rescheduled first.</p><WeeklyScheduleCalendar weekly={values.weekly} onChange={(weekly) => change('weekly', weekly)} /><h3 className="mt-4">Leave / unavailable dates</h3>{values.leave.map((leave, index) => <div className="workflow-schedule-row" key={index}>{['from', 'through'].map((key) => <Field key={key} label={key === 'from' ? 'From' : 'Through'} required type="date" value={leave[key]} onChange={(value) => change('leave', values.leave.map((item, i) => i === index ? { ...item, [key]: value } : item))} />)}<Field label="Reason" required maxLength={160} value={leave.reason} onChange={(value) => change('leave', values.leave.map((item, i) => i === index ? { ...item, reason: value } : item))} /><Button variant="link" onClick={() => change('leave', values.leave.filter((_, i) => i !== index))}>Remove leave</Button></div>)}<Button variant="outline-secondary" onClick={() => change('leave', [...values.leave, { from: '', through: '', reason: '' }])}>Add leave</Button></>
  }}</WorkflowForm>
}
function DoctorSchedule({ doctor }) {
  const resource = useApiResource(`/operations/schedules/${doctor.id}`)
  return <WorkflowResource resource={resource}>{({ record }) => <ScheduleEditor key={record?.version ?? 'new'} doctor={doctor} record={record} reload={resource.reload} />}</WorkflowResource>
}
export function SchedulesPage() {
  const { confirm, dialog } = useConfirmDialog()
  const [doctor, setDoctor] = useState(null)
  return <>{dialog}<header className="page-heading"><div><h1>Doctor schedules</h1><p>Set working periods, breaks, and leave before booking appointments.</p></div></header><section className="workspace-section"><RecordPicker kind="doctors" label="Doctor" value={doctor?.id || ''} selected={doctor} onChange={async (_id, record) => { if (doctor && !await confirm('Switching doctors will discard any unsaved schedule changes.', { title: 'Switch doctor?', confirmLabel: 'Discard and switch', cancelLabel: 'Keep editing', variant: 'danger' })) return; setDoctor(record) }} />{doctor && <DoctorSchedule key={doctor.id} doctor={doctor} />}</section></>
}
export function DiagnosticsPage() { return <><header className="page-heading"><div><h1>Diagnostics</h1><p>Manage requested tests, reports, and outstanding reviews. Latest 200 requests.</p></div></header><section className="workspace-section"><OrdersPanel /></section></> }
export function BillingPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || '', status = params.get('status') || 'all', from = params.get('from') || '', through = params.get('through') || ''
  const page = params.get('page') || '1', limit = params.get('limit') || '10'
  const query = new URLSearchParams({ q, status, from, through, page, limit })
  const resource = useApiResource(`/billing?${query}`)
  function filter(updates) { const next = new URLSearchParams(params); next.set('page', '1'); Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setParams(next, { replace: true }) }
  const invalidRange = from && through && from > through
  const filtered = q || status !== 'all' || from || through
  return <>
    <header className="page-heading"><div><h1>Billing</h1><p>Find clinic bills by patient, payment status, and encounter date. Dates use Manila time.</p></div></header>
    <section className="directory-panel" aria-label="Billing directory">
      <div className="directory-toolbar billing-filters">
        <DirectorySearch id="billing-search" label="Search patient name or patient ID" initialValue={q} onSearch={(q) => filter({ q })} loading={resource.loading} />
        <Form.Group controlId="billing-status"><Form.Label>Payment status</Form.Label><Form.Select value={status} onChange={(event) => filter({ status: event.target.value })}>{[['all', 'All statuses'], ['unpaid', 'Unpaid'], ['partially_paid', 'Partially paid'], ['paid', 'Paid'], ['no_charges', 'No charges']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>
        <Form.Group controlId="billing-from"><Form.Label>Encounter from</Form.Label><Form.Control type="date" value={from} max={through || undefined} onChange={(event) => filter({ from: event.target.value })} /></Form.Group>
        <Form.Group controlId="billing-through"><Form.Label>Encounter through</Form.Label><Form.Control type="date" value={through} min={from || undefined} isInvalid={!!invalidRange} onChange={(event) => filter({ through: event.target.value })} /><Form.Control.Feedback type="invalid">End date must be on or after the start date.</Form.Control.Feedback></Form.Group>
        <Button variant="outline-secondary" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>
      </div>
      <WorkflowResource resource={resource}>{({ records, pagination = { page: 1, pages: 1, total: records.length, limit: 10 } }) => <>
        {records.length ? <div className="table-scroll" role="region" aria-label="Billing table, scroll horizontally for all columns" tabIndex={0}>
          <Table className="directory-table billing-table">
            <caption className="visually-hidden">Clinic bills, payments, and outstanding balances. Encounter times are in Manila time.</caption>
            <thead><tr><th scope="col">Patient / encounter</th><th scope="col" className="numeric-cell">Total</th><th scope="col" className="numeric-cell">Net paid</th><th scope="col" className="numeric-cell">Balance</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>{records.map((record) => <tr key={record.id}>
              <th scope="row"><Link className="record-name" to={`/queue/${record.encounterId?._id}?tab=billing`}>{record.encounterId?.patientName || 'Patient unavailable'}</Link><span className="record-meta">{record.encounterId?.patientNumber} · {dateTime(record.encounterId?.arrivedAt)}</span></th>
              <td className="numeric-cell">{money(record.totalCentavos)}</td>
              <td className="numeric-cell">{money(record.paidCentavos)}</td>
              <td className="numeric-cell">{money(record.balanceCentavos)}</td>
              <td><span className={`record-status${!record.lines.length ? ' archived' : record.status === 'paid' ? '' : ' billing-outstanding'}`}>{record.billingStatus === 'no_charges' || !record.lines.length ? 'No charges' : record.status.replaceAll('_', ' ')}</span></td>
              <td><Link className="inline-action" to={`/queue/${record.encounterId?._id}?tab=billing`} aria-label={`Open bill for ${record.encounterId?.patientName || 'unavailable patient'}`}>Open bill</Link></td>
            </tr>)}</tbody>
          </Table>
        </div> : <div className="directory-empty" role="status"><h2>{filtered ? 'No matching bills' : 'No billing records yet'}</h2><p>{filtered ? 'Change or clear the filters to see other bills.' : 'Register a patient’s arrival to open their encounter and bill.'}</p></div>}
        <div className="directory-pagination"><p role="status">{pagination.total} billing {pagination.total === 1 ? 'record' : 'records'}</p><Form.Group controlId="billing-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={limit} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group><PaginationControls page={pagination.page} pages={pagination.pages} label="Billing pages" onPageChange={(page) => filter({ page: String(page) })} /></div>
      </>}</WorkflowResource>
    </section>
  </>
}
