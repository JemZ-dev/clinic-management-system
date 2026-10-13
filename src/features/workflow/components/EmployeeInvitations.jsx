import { useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Table from 'react-bootstrap/Table'
import { ROLE_LABELS } from '../../../../shared/permissions.js'
import useApiResource from '../../../hooks/useApiResource.js'
import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { api, apiError } from '../../../lib/api.js'
import { WorkflowResource } from './WorkflowUI.jsx'
import { dateTime } from '../workflow.js'

export function InvitationResult({ invitation }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  return <section className="workspace-section invitation-result" aria-label="New invitation code">
    <h2>Invitation created</h2>
    <p className="invitation-result-status">Account pending registration. No email has been sent.</p>
    <div className="invitation-result-layout">
      <div>
        <dl className="invitation-recipient"><div><dt>Invited email</dt><dd>{invitation.email}</dd></div><div><dt>Assigned role</dt><dd>{ROLE_LABELS[invitation.role]}</dd></div></dl>
        <div className="invitation-code-heading"><h3>Invitation code</h3><Button variant="outline-secondary" onClick={async () => { try { await navigator.clipboard.writeText(invitation.code); setCopied(true); setError('') } catch { setError('Unable to copy automatically. Select and copy the code below.') } }}>{copied ? 'Code copied' : 'Copy code'}</Button></div>
        <code className="invitation-code-value">{invitation.code}</code>
        <p className="record-meta">Valid for 48 hours · Can be used once</p>
      </div>
      <div className="invitation-instructions"><h3>Next steps</h3><ol><li>Share the code privately with the employee.</li><li>Ask them to open <span className="invitation-register-url">{window.location.origin}/register</span>.</li><li>They enter the invited email, their full name, a password, and the code to create their account.</li></ol></div>
    </div>
    <p className="invitation-result-note">Copy the code before leaving this page. If you lose it, use <strong>Replace invitation</strong> below to generate a new one.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
  </section>
}

export default function EmployeeInvitations({ revision, onCode }) {
  const resource = useApiResource(`/operations/invitations?refresh=${revision}`)
  const { confirm, dialog } = useConfirmDialog()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function act(invite, action) {
    const replacing = action === 'replace'
    if (!await confirm(replacing ? `Generate a new code for ${invite.email}? The previous code will stop working.` : `Revoke the invitation for ${invite.email}? They will no longer be able to register with its code.`, { title: replacing ? 'Replace invitation?' : 'Revoke invitation?', confirmLabel: replacing ? 'Replace invitation' : 'Revoke invitation', variant: replacing ? 'primary' : 'danger' })) return
    setBusy(invite.id); setError(''); setNotice('')
    try {
      const { data } = await api.post(`/operations/invitations/${invite.id}/${action}`, { version: invite.version })
      if (replacing) onCode({ code: data.code, email: invite.email, role: invite.role, id: invite.id })
      else { onCode(null); setNotice('Invitation revoked. Its code can no longer be used.') }
      resource.reload()
    } catch (failure) { setError(apiError(failure)); resource.reload() }
    finally { setBusy(null) }
  }
  return <>{dialog}<div className="section-heading mt-4"><div><h2>Pending invitations</h2><p className="section-description mb-0">Invited employees appear in the employee list after they register. Expired codes must be replaced.</p></div></div>
    {error && <Alert variant="danger" role="alert">{error}</Alert>}{notice && <Alert variant="success" role="status">{notice}</Alert>}
    <section className="directory-panel" aria-label="Pending invitations">
      <WorkflowResource resource={resource}>{({ records }) => records.length ? <div className="table-scroll" role="region" aria-label="Pending invitations table, scroll horizontally for all columns" tabIndex={0}>
        <Table className="directory-table accounts-table"><caption className="visually-hidden">Unused employee invitations and their expiration dates.</caption>
          <thead><tr><th scope="col">Invited employee</th><th scope="col">Role</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{records.map((invite) => <tr key={invite.id}><th scope="row"><span className="table-record-label">{invite.email}</span>{invite.doctor && <span className="record-meta">Doctor: {invite.doctor.name}</span>}</th><td>{ROLE_LABELS[invite.role]}</td><td>{dateTime(invite.expiresAt)}</td><td><span className={`record-status${invite.status === 'expired' ? ' archived' : ''}`}>{invite.status === 'expired' ? 'Expired' : 'Awaiting registration'}</span></td><td><div className="record-actions"><Button variant="link" disabled={!!busy} onClick={() => act(invite, 'replace')}>Replace invitation</Button><Button variant="link" className="invitation-revoke" disabled={!!busy} onClick={() => act(invite, 'revoke')}>Revoke</Button></div></td></tr>)}</tbody>
        </Table>
      </div> : <div className="directory-empty" role="status"><h2>No pending invitations</h2><p>Create an invitation when a new employee needs an account.</p></div>}</WorkflowResource>
    </section>
  </>
}
