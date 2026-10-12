import { Cross } from 'lucide-react'

export default function Brand() {
  return <div className="brand">
    <span className="brand-symbol"><Cross size={23} strokeWidth={2} aria-hidden="true" /></span>
    <span>Cliniqo<span className="brand-subtitle">Clinic management system</span></span>
  </div>
}
