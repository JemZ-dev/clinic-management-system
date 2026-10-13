export const MAX_PAYMENT_PESOS = 1000000
export const MAX_PAYMENT_REFERENCE_LENGTH = 50
export const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9 /_-]*$/
export const paymentAmountPattern = /^\d{1,7}(?:\.\d{1,2})?$/
export function paymentCentavos(value) {
  if (!paymentAmountPattern.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return amount > 0 && amount <= MAX_PAYMENT_PESOS * 100 ? amount : null
}
export function paymentErrors(values, availableCentavos, refund = false) {
  const fields = {}
  const amount = paymentCentavos(values.amount)
  if (amount === null) fields.amount = 'Enter an amount from ₱0.01 to ₱1,000,000.00 with at most 2 decimal places.'
  else if (amount > availableCentavos) fields.amount = refund ? 'Refund cannot exceed the net amount paid.' : 'Payment cannot exceed the outstanding balance.'
  if (!['cash', 'gcash'].includes(values.method)) fields.method = 'Choose Cash or GCash.'
  const reference = values.reference.trim()
  if (values.method === 'gcash' && !reference) fields.reference = 'Enter the GCash transaction reference.'
  else if (reference.length > MAX_PAYMENT_REFERENCE_LENGTH) fields.reference = 'Use 50 characters or fewer.'
  else if (!PAYMENT_REFERENCE_PATTERN.test(reference)) fields.reference = 'Use letters, numbers, spaces, hyphens, underscores, or slashes.'
  return fields
}
