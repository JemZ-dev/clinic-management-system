import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Table from 'react-bootstrap/Table'
import { Plus, Search } from 'lucide-react'
import useApiResource from '../../../hooks/useApiResource.js'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import StockStatus from '../components/StockStatus.jsx'

function MedicineSearch({ initial, onSearch }) {
  const [value, setValue] = useState(initial)
  return <Form role="search" className="record-search" onSubmit={(event) => { event.preventDefault(); onSearch(value.trim()) }}><Form.Label htmlFor="medicine-search" className="visually-hidden">Search generic name, brand, strength, or form</Form.Label><Form.Control id="medicine-search" type="search" value={value} maxLength={100} placeholder="Search generic name, brand, strength, or form" onChange={(event) => setValue(event.target.value)} /><Button type="submit" variant="outline-secondary"><Search size={16} aria-hidden="true" />Search</Button></Form>
}
export default function MedicinesPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const q = params.get('q') || ''
  const status = params.get('status') || 'active', stock = params.get('stock') || 'all'
  const resource = useApiResource(`/medicines?${new URLSearchParams({ q, status, stock, page: params.get('page') || '1', limit: params.get('limit') || '10' })}`)
  function filter(changes) { setParams((previous) => { const next = new URLSearchParams(previous); next.set('page', '1'); for (const [key, value] of Object.entries(changes)) next.set(key, value); return next }) }
  const backTo = `${location.pathname}${location.search}`
  const pagination = resource.data?.pagination
  return <>
    <header className="page-heading"><div><h1>Medicines</h1><p>Maintain distinct products and keep their stock records current.</p></div><Button as={Link} role="link" to="/medicines/new" state={{ backTo }}><Plus size={17} aria-hidden="true" />Add medicine</Button></header>
    <section className="directory-panel" aria-label="Medicine catalog"><div className="directory-toolbar medicine-toolbar"><MedicineSearch key={q} initial={q} onSearch={(q) => filter({ q })} /><Form.Group controlId="medicine-records-filter"><Form.Label>Records</Form.Label><Form.Select value={status} onChange={(event) => filter({ status: event.target.value })}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></Form.Select></Form.Group><Form.Group controlId="medicine-stock-filter"><Form.Label>Stock</Form.Label><Form.Select value={stock} onChange={(event) => filter({ stock: event.target.value })}><option value="all">All stock levels</option><option value="low">Low or out of stock</option><option value="available">Available stock</option><option value="out">Out of stock</option></Form.Select></Form.Group></div>
      {resource.loading ? <AsyncState loading title="Loading medicines" message="Fetching the catalog and current balances…" /> : resource.error ? <AsyncState title="Unable to load medicines" message={resource.error} onRetry={resource.reload} /> : !resource.data.records.length ? <div className="directory-empty" role="status"><h2>{q || stock !== 'all' || status !== 'active' ? 'No matching medicines' : 'No medicines yet'}</h2><p>{q || stock !== 'all' || status !== 'active' ? 'Change the search or filters to see other products.' : 'Add a catalog product, then record the stock received.'}</p></div> : <>
        <div className="table-scroll" role="region" aria-label="Medicine catalog table, scroll for all columns" tabIndex={0}><Table className="directory-table medicine-table"><caption className="visually-hidden">Medicine catalog and stock balances</caption><thead><tr><th scope="col">Medicine</th><th scope="col">Strength and form</th><th scope="col" className="numeric-cell">Stock</th><th scope="col" className="numeric-cell">Low-stock threshold</th><th scope="col">Status</th></tr></thead><tbody>{resource.data.records.map((record) => <tr key={record.id}><th scope="row"><Link to={`/medicines/${record.id}`} state={{ backTo }} className="record-name">{record.genericName}</Link><span className="record-meta">{record.brandName || 'No brand recorded'}</span></th><td>{record.strength}<span className="record-meta">{record.dosageForm}</span></td><td className="numeric-cell">{record.quantity.toLocaleString()}<span className="record-meta">{record.stockUnit}</span></td><td className="numeric-cell">{record.lowStockThreshold.toLocaleString()}<span className="record-meta">{record.stockUnit}</span></td><td><StockStatus record={record} /></td></tr>)}</tbody></Table></div>
        <div className="directory-pagination"><p role="status">{(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} medicines</p><Form.Group controlId="medicine-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={String(pagination.limit)} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group><nav className="page-controls" aria-label="Medicine pages"><Button variant="outline-secondary" disabled={pagination.page <= 1} onClick={() => filter({ page: String(pagination.page - 1) })}>Previous</Button><span>Page {pagination.page} of {pagination.pages}</span><Button variant="outline-secondary" disabled={pagination.page >= pagination.pages} onClick={() => filter({ page: String(pagination.page + 1) })}>Next</Button></nav></div>
      </>}
    </section>
  </>
}
