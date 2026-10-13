import { dateTime, money } from '../workflow.js'

export default function BillingReceipt({ record, encounter }) {
  return <article className="billing-receipt" aria-label="Printable billing statement">
    <header className="receipt-header">
      <div className="receipt-brand"><img src="/images/cliniqo-logo.png" alt="Cliniqo logo" /><div><strong>Cliniqo</strong><span>Clinic management system</span></div></div>
      <div className="receipt-title"><h1>Billing statement</h1><p>Payment acknowledgment</p><span>Statement ID: {encounter.id}</span></div>
    </header>
    <dl className="receipt-details">
      <div><dt>Patient</dt><dd>{encounter.patientName}</dd><dd>{encounter.patientNumber}</dd></div>
      <div><dt>Visit date · Manila time</dt><dd>{dateTime(encounter.arrivedAt)}</dd><dt>Attending doctor</dt><dd>{encounter.doctorName || 'Not recorded'}</dd></div>
    </dl>
    <h2>Charges</h2>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
      {record.lines.map((line) => <tr key={line._id} className={line.voided ? 'receipt-voided' : ''}><td>{line.description}{line.voided && <small>Voided: {line.voidReason}</small>}</td><td>{line.quantity}</td><td>{money(line.unitCentavos)}</td><td>{money(line.quantity * line.unitCentavos)}</td></tr>)}
      {!record.lines.length && <tr><td colSpan={4}>No charges recorded.</td></tr>}
    </tbody></table>
    <dl className="receipt-totals"><div><dt>Total charges</dt><dd>{money(record.totalCentavos)}</dd></div><div><dt>Net payments</dt><dd>{money(record.paidCentavos)}</dd></div><div className="receipt-balance"><dt>Balance due</dt><dd>{money(record.balanceCentavos)}</dd></div></dl>
    <h2>Payments received</h2>
    <table><thead><tr><th>Date / received by</th><th>Method / reference</th><th>Amount</th></tr></thead><tbody>
      {record.payments.map((payment) => <tr key={payment._id}><td>{dateTime(payment.at)}<small>{payment.actor.name}</small></td><td>{payment.method.replaceAll('_', ' ')}<small>{payment.reference || 'No reference'}{payment.reason && ` · ${payment.reason}`}</small></td><td>{payment.refund ? 'Refund ' : ''}{money(payment.amountCentavos)}</td></tr>)}
      {!record.payments.length && <tr><td colSpan={3}>No payments recorded.</td></tr>}
    </tbody></table>
    <footer className="receipt-footer"><strong>Thank you for choosing Cliniqo.</strong><p>Please keep this statement for your records.</p><small>Statement and payment acknowledgment for clinic records. This is not a tax invoice.</small></footer>
  </article>
}
