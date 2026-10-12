import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Alert from 'react-bootstrap/Alert'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'

const defaults = { genericName: '', brandName: '', strength: '', dosageForm: '', stockUnit: '', notes: '', lowStockThreshold: '0' }
function MedicineForm({ record }) {
  const navigate = useNavigate()
  const [initial] = useState(() => record ? Object.fromEntries(Object.keys(defaults).map((field) => [field, String(record[field])])) : defaults)
  const [values, setValues] = useState(initial)
  const [error, setError] = useState(''), [errors, setErrors] = useState({}), [busy, setBusy] = useState(false)
  const guard = useRef(true)
  const backTo = record ? `/medicines/${record.id}` : '/medicines'
  function change(field, value) { setValues((previous) => ({ ...previous, [field]: value })); setErrors((previous) => ({ ...previous, [field]: '' })) }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({})
    const data = { ...values, lowStockThreshold: Number(values.lowStockThreshold) }
    try {
      const response = record ? await api.patch(`/medicines/${record.id}`, { ...data, version: record.version }) : await api.post('/medicines', data)
      guard.current = false
      navigate(`/medicines/${response.data.record.id}`, { replace: true, state: { notice: 'Medicine saved successfully.' } })
    } catch (failure) { setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); requestAnimationFrame(() => document.getElementById('medicine-form-error')?.focus()) }
    finally { setBusy(false) }
  }
  function field(name, label, maxLength, help, required = true) { return <RecordField name={name} label={label} maxLength={maxLength} value={values[name]} errors={errors} onChange={change} required={required} help={help} readOnly={!!record?.identityLocked} /> }
  return <><UnsavedChanges dirty={JSON.stringify(initial) !== JSON.stringify(values)} busy={busy} guard={guard} /><Link to={backTo} className="record-back">Back to {record ? 'medicine' : 'medicines'}</Link><header className="page-heading"><div><h1>{record ? 'Edit medicine' : 'Add medicine'}</h1><p>Different strengths, dosage forms, and stock units need separate catalog entries.</p></div></header>
    <Form className="record-form" onSubmit={save}>{error && <Alert variant="danger" role="alert" tabIndex={-1} id="medicine-form-error">{error}<p className="mb-0 mt-2">Your entries are preserved. <Link to={backTo}>View the current {record ? 'medicine' : 'catalog'}</Link> before retrying if the record already exists or changed.</p></Alert>}<fieldset disabled={busy}>
      <section className="workspace-section" aria-labelledby="medicine-identity-title"><h2 id="medicine-identity-title">Product details</h2>{record?.identityLocked && <p className="section-description">This product has stock or prescription history. Its identity and unit are fixed; add a new product for a different strength or form.</p>}<div className="record-form-grid">{field('genericName', 'Generic name', 100)}{field('brandName', 'Brand name', 100, undefined, false)}{field('strength', 'Strength', 80, 'Copy the strength from the product label.')}{field('dosageForm', 'Dosage form', 80, 'For example, tablet, capsule, or oral solution.')}{field('stockUnit', 'Stock unit', 40, 'Count whole units, such as tablet, bottle, ampoule, or pack. Units are not converted automatically.')}</div></section>
      <section className="workspace-section" aria-labelledby="medicine-inventory-title"><h2 id="medicine-inventory-title">Inventory settings</h2><div className="record-form-grid"><RecordField name="lowStockThreshold" label="Low-stock threshold" value={values.lowStockThreshold} onChange={change} errors={errors} required type="number" min={0} max={1000000000} step={1} help="Flag this product when stock is at or below this quantity." /><RecordField name="notes" label="Inventory notes" value={values.notes} onChange={change} errors={errors} multiline maxLength={2000} help="Use for product or stock information, not prescribing guidance." /></div>{!record && <p className="record-meta mb-0">New products start with zero stock. Record a receipt after saving.</p>}</section>
      <div className="record-form-actions"><SubmitButton busy={busy}>Save medicine</SubmitButton><Button as={Link} role="link" variant="outline-secondary" to={backTo} onClick={(event) => { if (busy) event.preventDefault() }}>Cancel</Button></div>
    </fieldset></Form></>
}
function EditMedicine() {
  const { id } = useParams()
  const resource = useApiResource(`/medicines/${id}`)
  if (resource.loading) return <AsyncState loading title="Loading medicine" message="Fetching current product details…" />
  if (resource.error) return <AsyncState title="Unable to open medicine" message={resource.error} onRetry={resource.reload} />
  if (resource.data.record.archivedAt) return <div className="directory-empty"><h1>This medicine is archived</h1><p>Restore it before editing.</p><Link to={`/medicines/${id}`}>View medicine</Link></div>
  return <MedicineForm key={id} record={resource.data.record} />
}
export default function MedicineFormPage({ editing = false }) { return editing ? <EditMedicine /> : <MedicineForm /> }
