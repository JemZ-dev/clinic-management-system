import { useEffect, useId, useRef, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import Button from 'react-bootstrap/Button'

export default function useConfirmDialog() {
  const [request, setRequest] = useState(null)
  const pending = useRef(null)
  const id = useId()
  useEffect(() => () => { pending.current?.(false); pending.current = null }, [])
  function confirm(message, options = {}) {
    pending.current?.(false)
    return new Promise((resolve) => {
      pending.current = resolve
      setRequest({ message, title: 'Confirm action', confirmLabel: 'Continue', cancelLabel: 'Cancel', variant: 'primary', ...options })
    })
  }
  function finish(accepted) {
    const resolve = pending.current
    pending.current = null
    setRequest(null)
    resolve?.(accepted)
  }
  const dialog = <Modal show={!!request} onHide={() => finish(false)} centered contentClassName="unsaved-changes-modal-content" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
    <Modal.Header closeButton><Modal.Title id={`${id}-title`}>{request?.title}</Modal.Title></Modal.Header>
    <Modal.Body id={`${id}-description`}>{request?.message}</Modal.Body>
    <Modal.Footer><Button type="button" variant="outline-secondary" autoFocus onClick={() => finish(false)}>{request?.cancelLabel}</Button><Button type="button" variant={request?.variant} onClick={() => finish(true)}>{request?.confirmLabel}</Button></Modal.Footer>
  </Modal>
  return { confirm, dialog }
}
