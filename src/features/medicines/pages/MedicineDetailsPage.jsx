import { Access } from '../../../components/ui/Access.jsx'
import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import StockStatus from '../components/StockStatus.jsx'
import MovementHistory from '../../inventory/components/MovementHistory.jsx'

function MedicineDetails({ record, reload, refreshing, refreshError }) {
  const location = useLocation()
  const [type, setType] = useState('receipt'), [quantity, setQuantity] = useState(''), [note, setNote] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(''), [errors, setErrors] = useState({}), [conflict, setConflict] = useState(false), [notice, setNotice] = useState('')
  const [historyRevision, setHistoryRevision] = useState(0)
  const [stockOpen, setStockOpen] = useState(false), [discardStock, setDiscardStock] = useState(false)
  const guard = useRef(true)
  const unavailable = refreshing || !!refreshError
  const dirty = !!quantity || !!note || (stockOpen && type !== 'receipt')
  function closeStock() {
    if (busy) return
    if (dirty) { setDiscardStock(true); return }
    resetStock()
  }
  function resetStock() {
    setStockOpen(false); setDiscardStock(false); setQuantity(''); setNote(''); setType('receipt'); setError(''); setErrors({}); setConflict(false); setRequestId(crypto.randomUUID())
  }
  async function save(event) {
    event.preventDefault(); if (busy || unavailable || record.archivedAt || conflict) return; setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      await api.post(`/medicines/${record.id}/movements`, { requestId, version: record.version, type, quantity: Number(quantity), note })
      setStockOpen(false); setDiscardStock(false); setType('receipt'); setQuantity(''); setNote(''); setRequestId(crypto.randomUUID()); setNotice('Stock movement saved. The balance and history have been updated.'); setHistoryRevision((value) => value + 1); reload()
    } catch (failure) { setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  async function changeStatus() {
    setBusy(true); setError(''); setConflict(false)
    try {
      if (record.archivedAt) await api.post(`/medicines/${record.id}/restore`, { version: record.version })
      else await api.delete(`/medicines/${record.id}`, { data: { version: record.version } })
      setConfirm(false); setNotice(`Medicine ${record.archivedAt ? 'restored' : 'archived'}. Stock and history are preserved.`); reload()
    } catch (failure) { setError(apiError(failure)); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  return <><UnsavedChanges dirty={dirty} busy={busy} guard={guard} /><Link className="record-back" to="/medicines">Back to medicines</Link>
    <header className="page-heading"><div><h1>{record.genericName}</h1><p>{record.brandName ? `${record.brandName} · ` : ''}{record.strength} · {record.dosageForm}</p></div><Access permission="medicineCatalog"><div className="record-actions">{!record.archivedAt && <Button as={Link} role="link" to={`/medicines/${record.id}/edit`}>Edit medicine</Button>}<Button variant="outline-secondary" disabled={busy || unavailable || dirty} onClick={() => { setError(''); setConflict(false); setConfirm(true) }}>{record.archivedAt ? 'Restore' : 'Archive'}</Button></div></Access></header>
    {(notice || location.state?.notice) && <Alert variant="success" role="status">{notice || location.state.notice}</Alert>}
    {refreshing && <p role="status">Refreshing stock…</p>}{refreshError && !stockOpen && <Alert variant="danger" role="alert">Unable to refresh stock. {refreshError}<Button variant="link" onClick={reload}>Try again</Button></Alert>}
    <section className="workspace-section" aria-labelledby="stock-overview-title"><div className="section-heading"><h2 id="stock-overview-title">Current stock</h2><div className="record-actions"><StockStatus record={record} /><Access permission="dispense">{!record.archivedAt && <Button type="button" disabled={busy || unavailable} onClick={() => { setError(''); setErrors({}); setConflict(false); setStockOpen(true) }}>Edit stock</Button>}</Access></div></div><dl className="record-details"><div><dt>Available quantity</dt><dd className="stock-balance">{record.quantity.toLocaleString()} <span>{record.stockUnit}</span></dd></div><div><dt>Low-stock threshold</dt><dd>{record.lowStockThreshold.toLocaleString()} {record.stockUnit}</dd></div><div><dt>Inventory notes</dt><dd className="preserve-lines">{record.notes || 'Not recorded'}</dd></div></dl><p className="record-meta mb-0">Count whole {record.stockUnit} units. Units are not converted. {record.identityLocked && 'Product identity and unit are fixed to preserve saved history.'}</p></section>
    {record.archivedAt && <Alert variant="secondary">This medicine is archived. Restore it before prescribing or changing stock.</Alert>}
    <Access permission="dispense">{stockOpen && <Modal show onHide={closeStock} centered scrollable keyboard={!busy} backdrop="static" aria-labelledby="stock-modal-title">
      <Modal.Header closeButton={!busy}><Modal.Title id="stock-modal-title">Edit stock</Modal.Title></Modal.Header>
      <Modal.Body><p><strong>{record.genericName}</strong> · {record.quantity.toLocaleString()} {record.stockUnit} available</p><p className="section-description">Record deliveries as receipts. Use an adjustment to correct a count, with a reason.</p>
        {refreshError && <Alert variant="danger" role="alert">Unable to refresh stock. {refreshError}<Button variant="link" onClick={reload}>Try again</Button></Alert>}
        {discardStock && <Alert variant="warning"><p>Discard unsaved stock changes?</p><Button type="button" variant="outline-secondary" onClick={() => setDiscardStock(false)}>Keep editing</Button>{' '}<Button type="button" variant="danger" onClick={resetStock}>Discard changes</Button></Alert>}
        <Form id="stock-movement-form" onSubmit={save}>{error && !confirm && <Alert variant="danger" role="alert">{error}{conflict && <Button variant="link" onClick={() => { reload(); setConflict(false) }}>Reload current stock</Button>}</Alert>}<fieldset disabled={busy || unavailable || !!record.archivedAt}><div className="record-form-grid"><Form.Group controlId="stock-change-type"><Form.Label>Movement type</Form.Label><Form.Select autoFocus value={type} onChange={(event) => { setType(event.target.value); setErrors({}) }}><option value="receipt">Stock receipt</option><option value="adjustment">Stock adjustment</option></Form.Select></Form.Group><RecordField name="quantity" label={`Quantity (${record.stockUnit})`} value={quantity} onChange={(_field, value) => setQuantity(value)} errors={errors} required type="number" step={1} min={type === 'receipt' ? 1 : -1000000} max={1000000} help={type === 'receipt' ? 'Enter the whole units received.' : 'Use a positive number to add or a negative number to subtract. Zero is not an adjustment.'} /><RecordField name="note" label={type === 'adjustment' ? 'Reason for adjustment' : 'Receipt note'} value={note} onChange={(_field, value) => setNote(value)} errors={errors} multiline required={type === 'adjustment'} maxLength={500} /></div></fieldset></Form>
        <p className="record-meta mt-3 mb-0">To dispense medicine, open the saved prescription in <Link to="/visits">Visits</Link>.</p>
      </Modal.Body>
      <Modal.Footer><Button type="button" variant="outline-secondary" disabled={busy} onClick={closeStock}>Cancel</Button><SubmitButton form="stock-movement-form" busy={busy} disabled={discardStock || conflict || unavailable || !!record.archivedAt}>Save stock movement</SubmitButton></Modal.Footer>
    </Modal>}</Access>
    <Access permission="dispense"><MovementHistory key={`${record.id}:${historyRevision}`} medicineId={record.id} /></Access>
    <Modal show={confirm} onHide={() => { if (!busy) setConfirm(false) }} centered keyboard={!busy} backdrop={busy ? 'static' : true} aria-labelledby="medicine-status-title"><Modal.Header closeButton={!busy}><Modal.Title id="medicine-status-title">{record.archivedAt ? 'Restore' : 'Archive'} medicine?</Modal.Title></Modal.Header><Modal.Body><p>{record.archivedAt ? 'The product will return to the active catalog.' : 'This product will be unavailable for new prescriptions and stock movements. Its balance and history remain available.'}</p>{error && <Alert variant="danger" role="alert">{error}{conflict && <Button variant="link" onClick={() => { setConfirm(false); reload() }}>Reload medicine</Button>}</Alert>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button variant={record.archivedAt ? 'primary' : 'danger'} disabled={busy || conflict || unavailable} onClick={changeStatus}>{busy ? 'Saving…' : record.archivedAt ? 'Restore medicine' : 'Archive medicine'}</Button></Modal.Footer></Modal>
  </>
}
export default function MedicineDetailsPage() {
  const { id } = useParams()
  const resource = useApiResource(`/medicines/${id}`)
  const [snapshot, setSnapshot] = useState(null)
  if (resource.data && resource.data !== snapshot) setSnapshot(resource.data)
  if (resource.error && (!snapshot || snapshot.record.id !== id)) return <AsyncState title="Unable to open medicine" message={resource.error} onRetry={resource.reload} />
  if (!snapshot || snapshot.record.id !== id) return <AsyncState loading title="Loading medicine" message="Fetching product and stock details…" />
  return <MedicineDetails key={id} record={snapshot.record} reload={resource.reload} refreshing={resource.loading} refreshError={resource.error} />
}
