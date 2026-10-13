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
import { dosageForms, dosageFormGroups, dosageFormLabel } from '../dosageForms.js'

const defaults = { genericName: '', brandName: '', strength: '', dosageForm: '', stockUnit: '', notes: '', lowStockThreshold: '0' }
const stockUnits = ['tablet', 'capsule', 'bottle', 'vial', 'ampoule', 'tube', 'sachet', 'pack', 'box', 'strip', 'blister pack', 'syringe', 'inhaler', 'patch', 'suppository', 'lozenge']
function MedicineForm({ record }) {
  const navigate = useNavigate()
  const [initial] = useState(() => record ? Object.fromEntries(Object.keys(defaults).map((field) => [field, String(record[field])])) : defaults)
  const [values, setValues] = useState(initial)
  const [dosageSelection, setDosageSelection] = useState(() => initial.dosageForm && !dosageForms.includes(initial.dosageForm) ? 'other' : initial.dosageForm)
  const [stockSelection, setStockSelection] = useState(() => initial.stockUnit && !stockUnits.includes(initial.stockUnit) ? 'other' : initial.stockUnit)
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
  const dosageField = <div>
    <Form.Group controlId="medicine-dosage-form">
      <Form.Label>Dosage form <span className="required-marker">*</span></Form.Label>
      <Form.Select name="dosageFormChoice" required value={dosageSelection} disabled={!!record?.identityLocked} isInvalid={!!errors.dosageForm} aria-describedby="medicine-dosage-help" onChange={(event) => { const selected = event.target.value; setDosageSelection(selected); change('dosageForm', selected === 'other' ? '' : selected) }}>
        <option value="">Choose a dosage form</option>
        {dosageFormGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.forms.map((form) => <option key={form} value={form}>{dosageFormLabel(form)}</option>)}</optgroup>)}
        <option value="other">Other — specify from label</option>
      </Form.Select>
      {errors.dosageForm && <Form.Control.Feedback type="invalid">{errors.dosageForm}</Form.Control.Feedback>}
      <Form.Text id="medicine-dosage-help">Choose the form on the product label, including any release type.</Form.Text>
    </Form.Group>
    {dosageSelection === 'other' && <div className="mt-3">{field('dosageForm', 'Specify dosage form', 80, 'Copy the exact dosage form from the label.')}</div>}
  </div>
  const stockUnitField = <div>
    <Form.Group controlId="medicine-stock-unit">
      <Form.Label>Stock unit <span className="required-marker">*</span></Form.Label>
      <Form.Select name="stockUnitChoice" required value={stockSelection} disabled={!!record?.identityLocked} isInvalid={!!errors.stockUnit} aria-describedby="medicine-stock-unit-help" onChange={(event) => { const selected = event.target.value; setStockSelection(selected); change('stockUnit', selected === 'other' ? '' : selected) }}>
        <option value="">Choose a stock unit</option>
        {stockUnits.map((unit) => <option key={unit} value={unit}>{dosageFormLabel(unit)}</option>)}
        <option value="other">Other — specify</option>
      </Form.Select>
      {errors.stockUnit && <Form.Control.Feedback type="invalid">{errors.stockUnit}</Form.Control.Feedback>}
      <Form.Text id="medicine-stock-unit-help">Choose the whole unit you count and dispense. For example, 20 tablets or 3 bottles. Packs and boxes are not converted into individual units automatically.</Form.Text>
    </Form.Group>
    {stockSelection === 'other' && <div className="mt-3">{field('stockUnit', 'Specify stock unit', 40, 'Use one consistent counting unit for this product.')}</div>}
  </div>
  return <><UnsavedChanges dirty={JSON.stringify(initial) !== JSON.stringify(values)} busy={busy} guard={guard} /><Link to={backTo} className="record-back">Back to {record ? 'medicine' : 'medicines'}</Link><header className="page-heading"><div><h1>{record ? 'Edit medicine' : 'Add medicine'}</h1><p>Different strengths, dosage forms, and stock units need separate catalog entries.</p></div></header>
    <Form className="record-form" onSubmit={save}>{error && <Alert variant="danger" role="alert" tabIndex={-1} id="medicine-form-error">{error}<p className="mb-0 mt-2">Your entries are preserved. <Link to={backTo}>View the current {record ? 'medicine' : 'catalog'}</Link> before retrying if the record already exists or changed.</p></Alert>}<fieldset disabled={busy}>
      <section className="workspace-section" aria-labelledby="medicine-identity-title"><h2 id="medicine-identity-title">Product details</h2>{record?.identityLocked && <p className="section-description">This product has stock or prescription history. Its identity and unit are fixed; add a new product for a different strength or form.</p>}<div className="record-form-grid">{field('genericName', 'Generic name', 100)}{field('brandName', 'Brand name', 100, undefined, false)}{field('strength', 'Strength', 80, 'Amount of active ingredient per unit or volume, as printed on the label. Examples: 500 mg per tablet, 250 mg/5 mL, or 1%.')}{dosageField}{stockUnitField}</div></section>
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
