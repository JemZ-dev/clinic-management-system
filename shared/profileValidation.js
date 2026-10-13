export const profileFields = ['name', 'phone', 'gender', 'dateOfBirth', 'jobTitle', 'department', 'workLocation']
const textLimits = { name: 100, phone: 30, jobTitle: 100, department: 100, workLocation: 160 }
const genders = ['', 'female', 'male', 'non_binary', 'other', 'prefer_not_to_say']
const todayInClinic = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function profileFieldError(name, input, today = todayInClinic()) {
  if (typeof input !== 'string') return 'Enter a valid value.'
  const value = input.trim()
  if (textLimits[name] && value.length > textLimits[name]) return `Use ${textLimits[name]} characters or fewer.`
  if (name === 'name') {
    if (!value) return 'Enter your full name.'
    if (value.length < 2) return 'Enter at least 2 characters.'
    if (!/\p{L}/u.test(value)) return 'Enter a name that includes letters.'
  }
  if (name === 'phone' && value) {
    if (!/^\+?[\d\s().-]+$/.test(value)) return 'Use digits, spaces, parentheses, hyphens, and an optional leading +.'
    const digits = value.replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) return 'Enter a phone number with 7 to 15 digits.'
  }
  if (name === 'gender' && !genders.includes(value)) return 'Choose a gender from the list.'
  if (name === 'dateOfBirth' && value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a complete, valid date of birth.'
    const date = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return 'Enter a real calendar date.'
    if (value < '1900-01-01') return 'Choose a birth date on or after January 1, 1900.'
    if (value > today) return 'Date of birth cannot be in the future.'
  }
  return ''
}

export function validateProfile(values, today = todayInClinic()) {
  const errors = {}
  for (const name of profileFields) {
    const message = profileFieldError(name, values[name] ?? '', today)
    if (message) errors[name] = message
  }
  return errors
}
