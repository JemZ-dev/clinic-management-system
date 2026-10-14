export const MAX_PHONE_CHARACTERS = 30
export const PHONE_HELP = 'Mobile or landline: 7–15 digits. Spaces, hyphens, parentheses and a leading + are allowed.'

export function phoneError(input) {
  if (typeof input !== 'string') return 'Enter a valid phone number.'
  const value = input.trim()
  if (!value) return ''
  if (value.length > MAX_PHONE_CHARACTERS) return 'Use 30 characters or fewer, including formatting.'
  if (!/^\+?[0-9 ().-]+$/.test(value)) return 'Use digits, spaces, parentheses, hyphens, and an optional leading +.'
  let open = false
  for (const character of value) {
    if (character === '(') {
      if (open) return 'Check the parentheses in the phone number.'
      open = true
    } else if (character === ')') {
      if (!open) return 'Check the parentheses in the phone number.'
      open = false
    }
  }
  if (open) return 'Check the parentheses in the phone number.'
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length < 7 || digits.length > 15) return 'Enter a mobile or landline number with 7 to 15 digits.'
  if (value.startsWith('+') && digits.startsWith('0')) return 'After +, enter the country code without a leading 0.'
  return ''
}
