import { useEffect, useRef, useState } from 'react'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Spinner from 'react-bootstrap/Spinner'
import { Search, X } from 'lucide-react'

export default function DirectorySearch({ id, label, initialValue = '', onSearch, loading = false }) {
  const [value, setValue] = useState(initialValue)
  const [lastInitial, setLastInitial] = useState(initialValue)
  const [composing, setComposing] = useState(false)
  const timer = useRef(null)
  const callback = useRef(onSearch)

  // URL changes (including Back/Forward) update the field without remounting it.
  if (lastInitial !== initialValue) {
    setLastInitial(initialValue)
    if (value.trim() !== initialValue.trim()) setValue(initialValue)
  }
  useEffect(() => { callback.current = onSearch }, [onSearch])
  useEffect(() => {
    if (composing || value.trim() === initialValue.trim()) return
    timer.current = setTimeout(() => {
      timer.current = null
      callback.current(value.trim())
    }, 300)
    return () => { clearTimeout(timer.current); timer.current = null }
  }, [value, initialValue, composing])

  function searchNow(query) {
    clearTimeout(timer.current); timer.current = null
    if (query !== initialValue.trim()) onSearch(query)
  }
  const pending = value.trim() !== initialValue.trim()
  return <Form role="search" className="record-search" aria-busy={loading || pending} onSubmit={(event) => { event.preventDefault(); if (!composing) searchNow(value.trim()) }}>
    <Form.Label htmlFor={id} className="visually-hidden">{label}</Form.Label>
    <span className="search-label" aria-hidden="true">Search</span>
    <div className="search-field"><Search size={16} aria-hidden="true" /><Form.Control id={id} type="search" value={value} maxLength={100} placeholder={label} onChange={(event) => setValue(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />{(loading || pending) && <Spinner animation="border" size="sm" className="search-progress" aria-hidden="true" />}{value && <Button type="button" variant="link" className="search-clear" aria-label="Clear search input" onClick={() => { setValue(''); searchNow(''); requestAnimationFrame(() => document.getElementById(id)?.focus()) }}><X size={15} aria-hidden="true" /></Button>}</div>
  </Form>
}
