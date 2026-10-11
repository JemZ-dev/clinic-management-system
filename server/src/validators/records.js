import { z } from 'zod'

const text = (max) => z.string().trim().max(max, `Use ${max} characters or fewer.`)
const name = text(100).min(2, 'Enter at least 2 characters.')
const phone = text(30).regex(/^[+\d\s().-]*$/, 'Enter a valid phone number.')
const email = text(254).toLowerCase().refine((value) => !value || z.email().safeParse(value).success, 'Enter a valid email address.')

export function todayInClinic() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function validBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > todayInClinic()) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export const patientSchema = z.object({
  name,
  dateOfBirth: z.string().refine(validBirthDate, 'Enter a real birth date from 1900 through today.'),
  phone: phone.default(''), email: email.default(''), address: text(500).default(''),
  emergencyContact: z.object({ name: text(100).default(''), relationship: text(80).default(''), phone: phone.default('') }).strict().default({ name: '', relationship: '', phone: '' }),
  medicalHistory: z.object({
    allergies: text(2000).default(''), conditions: text(2000).default(''),
    pastSurgeries: text(2000).default(''), currentMedications: text(2000).default(''),
  }).strict().default({ allergies: '', conditions: '', pastSurgeries: '', currentMedications: '' }),
}).strict()

export const doctorSchema = z.object({ name, specialty: text(100).min(2, 'Enter a specialty.'), phone: phone.default(''), email: email.default('') }).strict()
export const versionSchema = z.object({ version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()
export const patientUpdateSchema = patientSchema.extend({ version: versionSchema.shape.version })
export const doctorUpdateSchema = doctorSchema.extend({ version: versionSchema.shape.version })
export const recordIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'The record address is invalid.')
export const listSchema = z.object({
  q: text(100).default(''), status: z.enum(['active', 'archived', 'all']).default('active'),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict()
