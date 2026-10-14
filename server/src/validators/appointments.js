import { z } from 'zod'
import { recordIdSchema, versionSchema } from './records.js'
import { validDate } from '../utils/clinicTime.js'

const date = z.string().refine(validDate, 'Enter a real calendar date.')
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid start time.')
export const durationSchema = z.number().int().min(1, 'Use at least 1 minute.').max(1440, 'Use 1,440 minutes or fewer.')
export const appointmentSchema = z.object({
  patientId: recordIdSchema, doctorId: recordIdSchema, date, time,
  durationMinutes: durationSchema.default(30),
  followUpEncounterId: recordIdSchema.optional(),
  reason: z.string().trim().max(500, 'Use 500 characters or fewer.').default(''),
}).strict()
export const appointmentUpdateSchema = appointmentSchema.extend({ version: versionSchema.shape.version, durationMinutes: durationSchema.optional() })
export const appointmentStatusSchema = z.object({
  version: versionSchema.shape.version,
  status: z.enum(['checked_in', 'completed', 'cancelled', 'no_show']),
  note: z.string().trim().max(500, 'Use 500 characters or fewer.').default(''),
}).strict()
export const appointmentListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'scheduled', 'checked_in', 'completed', 'cancelled', 'no_show']).default('all'),
  date: z.union([z.literal(''), date]).default(''),
  patientId: recordIdSchema.optional(), doctorId: recordIdSchema.optional(),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict()
