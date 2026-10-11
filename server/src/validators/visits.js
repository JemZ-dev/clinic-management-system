import { z } from 'zod'
import { recordIdSchema, versionSchema } from './records.js'
import { clinicDate, validDate } from '../utils/clinicTime.js'

const text = (max) => z.string().trim().max(max, `Use ${max} characters or fewer.`)
export const visitSchema = z.object({
  requestId: z.uuid(), patientId: recordIdSchema, doctorId: recordIdSchema,
  appointmentId: recordIdSchema.optional(), appointmentVersion: versionSchema.shape.version.optional(),
  date: z.string().refine((value) => validDate(value) && value <= clinicDate(), 'Choose a real visit date through today (Manila time).'),
  reason: text(500).min(2, 'Enter a reason for the visit.'),
  diagnosis: text(2000).default(''), notes: text(4000).default(''), treatment: text(4000).default(''),
  prescribedMedicines: text(2000).default(''), followUp: text(2000).default(''),
}).strict().superRefine((data, context) => {
  if (!!data.appointmentId !== (data.appointmentVersion !== undefined)) context.addIssue({ code: 'custom', path: ['appointmentId'], message: 'An appointment and its loaded version must be supplied together.' })
})
export const addendumSchema = z.object({ requestId: z.uuid(), version: versionSchema.shape.version, text: text(2000).min(2, 'Enter the correction or additional information.') }).strict()
export const visitListSchema = z.object({
  q: text(100).default(''), patientId: recordIdSchema.optional(), doctorId: recordIdSchema.optional(),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict()
