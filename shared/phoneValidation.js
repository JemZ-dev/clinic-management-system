export const MAX_PHONE_CHARACTERS = 11
export const PHONE_HELP = 'Mobile or landline: 7–11 digits. Numbers only.'

export function phoneError(input) {
  if (typeof input !== 'string') return 'Enter a valid phone number.'
  const value = input.trim()
  if (!value) return ''
  if (value.length > MAX_PHONE_CHARACTERS) return 'Use 11 digits or fewer.'
  if (!/^[0-9]+$/.test(value)) return 'Use digits only.'
  if (value.length < 7) return 'Enter a mobile or landline number with 7 to 11 digits.'
  return ''
}
