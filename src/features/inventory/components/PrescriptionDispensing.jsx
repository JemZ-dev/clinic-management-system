import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Modal from 'react-bootstrap/Modal'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import RecordField from '../../../components/records/RecordField.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import { medicineLabel } from '../../../lib/medicine.js'

function DispenseForm({ record, line, reloadVisit, refreshing, refreshError, blocked, onClose, onSaved, onStateChange }) {
  const medicine = useApiResource(`/medicines/${line.medicineId}`)
  const [quantity, setQuantity] = useState(''), [note, setNote] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false)
  const [error, setError] = useState(''), [errors, setErrors] = useState({}), [conflict, setConflict] = useState(false)
  const dirty = !!quantity || !!note
  useEffect(() => { onStateChange({ dirty, busy }) }, [dirty, busy, onStateChange])
  useEffect(() => () => onStateChange({ dirty: false, busy: false }), [onStateChange])
  const product = medicine.data?.record
  const unavailable = medicine.loading || !!medicine.error || refreshing || !!refreshError || blocked
  const cannotDispense = unavailable || !product || !!product.archivedAt || product.quantity === 0 || line.remainingQuantity <= 0
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose() }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      await api.post(`/medicines/${line.medicineId}/movements`, { requestId, version: product.version, visitVersion: record.version, type: 'dispense', quantity: Number(quantity), note, visitId: record.id, prescriptionId: line.id })
      onSaved(); onClose()
    } catch (failure) { setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  return <Modal show onHide={close} centered keyboard={!busy} backdrop={busy ? 'static' : true} aria-labelledby="dispense-title"><Modal.Header closeButton={!busy}><Modal.Title id="dispense-title">Dispense medicine</Modal.Title></Modal.Header><Modal.Body><p><strong>{medicineLabel(line.medicine)}</strong></p><p className="preserve-lines">{line.instructions}</p><p>{line.remainingQuantity.toLocaleString()} {line.medicine.stockUnit} remain on this prescription.</p><p className="record-meta">Review the consultation and dated corrections before dispensing. Record only the units actually supplied.</p>
    {medicine.loading ? <AsyncState loading title="Checking available stock" message="Fetching the current balance…" /> : medicine.error ? <AsyncState title="Unable to check stock" message={medicine.error} onRetry={medicine.reload} /> : <p role="status">{product.archivedAt ? 'This medicine is archived. Restore it in the catalog before dispensing.' : `${product.quantity.toLocaleString()} ${product.stockUnit} currently available.`}</p>}
    {refreshing && <p role="status">Refreshing visit…</p>}{refreshError && <Alert variant="danger" role="alert">Unable to refresh the visit. {refreshError}<Button variant="link" onClick={reloadVisit}>Try again</Button></Alert>}
    {error && <Alert variant="danger" role="alert">{error}{conflict && <Button variant="link" onClick={() => { medicine.reload(); reloadVisit(); setConflict(false) }}>Reload stock and visit</Button>}</Alert>}
    {line.remainingQuantity <= 0 && <p role="status">This prescription has been fully dispensed. Your entries are preserved for review.</p>}
    <Form id="dispense-form" onSubmit={save}><fieldset disabled={busy || unavailable}><RecordField name="quantity" label={`Quantity to dispense (${line.medicine.stockUnit})`} value={quantity} errors={errors} onChange={(_name, value) => setQuantity(value)} required type="number" min={1} max={product ? Math.max(1, Math.min(product.quantity, line.remainingQuantity, 1000000)) : 1000000} step={1} readOnly={cannotDispense} /><RecordField name="note" label="Dispensing note" value={note} errors={errors} onChange={(_name, value) => setNote(value)} multiline maxLength={500} /></fieldset></Form>
    {discard && <Alert variant="warning" role="alert" className="mt-3 mb-0">Discard these unsaved dispensing entries?<div className="record-actions mt-2"><Button variant="outline-secondary" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard entries</Button></div></Alert>}
    </Modal.Body><Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={close}>Cancel</Button><SubmitButton form="dispense-form" busy={busy} disabled={cannotDispense || conflict}>Save dispensing</SubmitButton></Modal.Footer></Modal>
}
export default function PrescriptionDispensing({ record, reload, refreshing, refreshError, blocked, onStateChange }) {
  const [selectedId, setSelectedId] = useState(null), [notice, setNotice] = useState('')
  const lines = record.prescriptions || []
  const line = lines.find((entry) => entry.id === selectedId)
  if (!lines.length) return null
  return <section className="workspace-section" aria-labelledby="saved-prescriptions-title"><div className="section-heading"><h2 id="saved-prescriptions-title">Catalog prescriptions</h2><Link to={`/inventory?visitId=${record.id}`}>View dispensing history</Link></div><p className="section-description">Prescription details are preserved as recorded. Inventory changes only when dispensing is saved.</p>{notice && <Alert variant="success" role="status">{notice}</Alert>}
    {lines.map((entry) => <div className="prescription-line" key={entry.id}><h3>{medicineLabel(entry.medicine)}</h3><p className="preserve-lines">{entry.instructions}</p><dl className="prescription-quantities"><div><dt>Prescribed</dt><dd>{entry.quantity.toLocaleString()} {entry.medicine.stockUnit}</dd></div><div><dt>Dispensed</dt><dd>{entry.dispensedQuantity.toLocaleString()} {entry.medicine.stockUnit}</dd></div><div><dt>Remaining</dt><dd>{entry.remainingQuantity.toLocaleString()} {entry.medicine.stockUnit}</dd></div></dl>{entry.remainingQuantity > 0 ? <Button variant="outline-secondary" disabled={blocked || refreshing || !!refreshError} onClick={() => setSelectedId(entry.id)} aria-label={`Dispense ${entry.medicine.genericName}`}>Dispense medicine</Button> : <p className="record-meta mb-0">Fully dispensed</p>}</div>)}
    {line && <DispenseForm key={line.id} record={record} line={line} reloadVisit={reload} refreshing={refreshing} refreshError={refreshError} blocked={blocked} onClose={() => setSelectedId(null)} onSaved={() => { setNotice('Dispensing saved. Stock and the remaining prescription quantity have been updated.'); reload() }} onStateChange={onStateChange} />}
  </section>
}
