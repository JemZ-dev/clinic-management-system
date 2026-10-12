import { useState } from 'react'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import { Search, X } from 'lucide-react'

export default function DirectorySearch({ id, label, initialValue = '', onSearch }) {
  const [value, setValue] = useState(initialValue)
  return <Form role="search" className="record-search" onSubmit={(event) => { event.preventDefault(); onSearch(value.trim()) }}>
    <Form.Label htmlFor={id} className="visually-hidden">{label}</Form.Label>
    <span className="search-label" aria-hidden="true">Search</span>
    <div className="search-controls">
      <div className="search-field"><Search size={16} aria-hidden="true" /><Form.Control id={id} type="search" value={value} maxLength={100} placeholder={label} onChange={(event) => setValue(event.target.value)} />{value && <Button type="button" variant="link" className="search-clear" aria-label="Clear search input" onClick={() => { setValue(''); onSearch(''); requestAnimationFrame(() => document.getElementById(id)?.focus()) }}><X size={15} aria-hidden="true" /></Button>}</div>
      <Button type="submit" variant="outline-secondary">Search</Button>
    </div>
  </Form>
}
