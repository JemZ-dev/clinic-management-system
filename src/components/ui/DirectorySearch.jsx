import { useState } from 'react'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import { Search } from 'lucide-react'

export default function DirectorySearch({ id, label, initialValue = '', onSearch }) {
  const [value, setValue] = useState(initialValue)
  return <Form role="search" className="record-search" onSubmit={(event) => { event.preventDefault(); onSearch(value.trim()) }}>
    <Form.Label htmlFor={id} className="visually-hidden">{label}</Form.Label>
    <div className="search-field"><Search size={15} aria-hidden="true" /><Form.Control id={id} type="search" value={value} maxLength={100} placeholder={label} onChange={(event) => setValue(event.target.value)} /></div>
    <Button type="submit" variant="outline-secondary">Search</Button>
  </Form>
}
