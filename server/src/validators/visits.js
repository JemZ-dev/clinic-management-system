import { z } from 'zod'
import { recordIdSchema, versionSchema } from './records.js'
import { clinicDate, validDate } from '../utils/clinicTime.js'
import { prescriptionSchema } from './medicines.js'

const text = (max) => z.string().trim().max(max, `Use ${max} characters or fewer.`)
export const visitSchema = z.object({
  requestId: z.uuid(), patientId: recordIdSchema, doctorId: recordIdSchema,
  appointmentId: recordIdSchema.optional(), appointmentVersion: versionSchema.shape.version.optional(),
  date: z.string().refine((value) => validDate(value) && value <= clinicDate(), 'Choose a real visit date through today (Manila time).'),
  reason: text(500).min(2, 'Enter a reason for the visit.'),
  diagnosis: text(2000).default(''), notes: text(4000).default(''), treatment: text(4000).default(''),
  prescribedMedicines: text(2000).default(''), followUp: text(2000).default(''),
  prescriptions: z.array(prescriptionSchema).max(20, 'Use at most 20 prescription lines per visit.').default([]),
}).strict().superRefine((data, context) => {
  if (!!data.appointmentId !== (data.appointmentVersion !== undefined)) context.addIssue({ code: 'custom', path: ['appointmentId'], message: 'An appointment and its loaded version must be supplied together.' })
  const seen = new Set()
  data.prescriptions.forEach((line, index) => {
    if (seen.has(line.medicineId)) context.addIssue({ code: 'custom', path: ['prescriptions', index, 'medicineId'], message: 'Combine this product into one prescription line.' })
    seen.add(line.medicineId)
  })
})
export const addendumSchema = z.object({ requestId: z.uuid(), version: versionSchema.shape.version, text: text(2000).min(2, 'Enter the correction or additional information.') }).strict()
export const visitListSchema = z.object({
  q: text(100).default(''), patientId: recordIdSchema.optional(), doctorId: recordIdSchema.optional(),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict()
