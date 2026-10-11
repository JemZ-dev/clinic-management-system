import { Cross } from 'lucide-react'

export default function Brand() {
  return <div className="brand">
    <span className="brand-symbol"><Cross size={23} strokeWidth={2} aria-hidden="true" /></span>
    <span>Clinic<span className="brand-subtitle">Management system</span></span>
  </div>
}
