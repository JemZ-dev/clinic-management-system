import { useCallback, useEffect, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router'
import Modal from 'react-bootstrap/Modal'
import Button from 'react-bootstrap/Button'

export default function UnsavedChanges({ dirty, busy, guard }) {
  const [signOut, setSignOut] = useState(null)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current && (dirty || busy) &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  useBeforeUnload(useCallback((event) => {
    if (dirty || busy) { event.preventDefault(); event.returnValue = '' }
  }, [dirty, busy]))
  useEffect(() => {
    function handle(event) {
      if (dirty || busy) {
        event.preventDefault()
        setSignOut(() => event.detail.proceed)
      }
    }
    window.addEventListener('clinic-before-signout', handle)
    return () => window.removeEventListener('clinic-before-signout', handle)
  }, [dirty, busy])
  const blocked = blocker.state === 'blocked'
  function stay() { if (blocked) blocker.reset(); setSignOut(null) }
  function leave() {
    if (blocked) blocker.proceed()
    if (signOut) signOut()
    setSignOut(null)
  }
  return <Modal show={blocked || !!signOut} onHide={stay} centered aria-labelledby="unsaved-title" contentClassName="unsaved-changes-modal-content">
    <Modal.Header closeButton><Modal.Title id="unsaved-title">{busy ? 'Saving your changes' : 'Discard unsaved changes?'}</Modal.Title></Modal.Header>
    <Modal.Body>{busy ? 'Wait for the save to finish before leaving this page.' : 'Your changes have not been saved. Stay on this page to keep editing.'}</Modal.Body>
    <Modal.Footer><Button variant="outline-secondary" onClick={stay}>{busy ? 'Stay on page' : 'Keep editing'}</Button>{!busy && <Button variant="danger" onClick={leave}>Discard changes</Button>}</Modal.Footer>
  </Modal>
}
