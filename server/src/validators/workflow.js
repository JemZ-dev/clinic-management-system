import { z } from 'zod'
import { emailDomainError } from '../../../shared/emailPolicy.js'
import { MAX_PAYMENT_REFERENCE_LENGTH, PAYMENT_REFERENCE_PATTERN } from '../../../shared/paymentValidation.js'
import { recordIdSchema as id, phoneSchema } from './records.js'
import { clinicDate, validDate } from '../utils/clinicTime.js'
import { prescriptionSchema } from './medicines.js'
const text = (max) => z.string().trim().max(max)
const date = z.string().refine(validDate, 'Enter a valid date.')
export const version = z.number().int().nonnegative()
const requestId = z.uuid()
const optionalNumber = (min, max) => z.number().min(min).max(max).nullable().optional()
export const encounterInput = z.object({ requestId, patientId: id, doctorId: id.optional(), appointmentId: id.optional(), appointmentVersion: version.optional(), kind: z.enum(['appointment', 'walk_in', 'external_test']), reason: text(500).min(2), externalClinician: text(160).default('') }).strict().superRefine((data, ctx) => {
  if (data.kind !== 'external_test' && !data.doctorId) ctx.addIssue({ code: 'custom', path: ['doctorId'], message: 'Choose a doctor.' })
  if (data.kind === 'appointment' && (!data.appointmentId || data.appointmentVersion === undefined)) ctx.addIssue({ code: 'custom', path: ['appointmentId'], message: 'Select the appointment and its current version.' })
  if (data.kind !== 'appointment' && data.appointmentId) ctx.addIssue({ code: 'custom', path: ['appointmentId'], message: 'Only appointment arrivals can link a booking.' })
  if (data.kind === 'external_test' && !data.externalClinician) ctx.addIssue({ code: 'custom', path: ['externalClinician'], message: 'Record the referring clinician.' })
})
export const assessmentInput = z.object({ version,
  weight: optionalNumber(0.1, 650), height: optionalNumber(20, 300), systolic: optionalNumber(20, 350), diastolic: optionalNumber(10, 250),
  temperature: optionalNumber(25, 45), pulse: optionalNumber(10, 350), oxygen: optionalNumber(1, 100),
  notMeasuredReason: text(500).default(''), measuredAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((data, ctx) => {
  if (['weight', 'height', 'systolic', 'diastolic'].some((key) => data[key] == null) && !data.notMeasuredReason) ctx.addIssue({ code: 'custom', path: ['notMeasuredReason'], message: 'Explain any required measurement not taken.' })
  if ((data.systolic == null) !== (data.diastolic == null)) ctx.addIssue({ code: 'custom', path: ['diastolic'], message: 'Enter both blood pressure values or leave both blank.' })
  if (new Date(data.measuredAt).valueOf() > Date.now() + 60000) ctx.addIssue({ code: 'custom', path: ['measuredAt'], message: 'Measurement time cannot be in the future.' })
})
export const draftInput = z.object({ version, reason: text(500).min(2), diagnosis: text(2000).default(''), notes: text(4000).default(''), treatment: text(4000).default(''), prescribedMedicines: text(2000).default(''), followUp: text(2000).default(''), followUpDate: z.union([z.literal(''), date.refine((value) => value >= clinicDate(), 'Choose today or a future date.')]).default(''), prescriptions: z.array(prescriptionSchema).max(20).default([]) }).strict()
export const serviceInput = z.object({ code: text(30).min(2).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()), name: text(160).min(2), category: z.enum(['consultation', 'laboratory', 'imaging', 'diagnostic', 'procedure']), priceCentavos: z.number().int().min(0).max(100000000), external: z.boolean(), provider: text(160).default(''), preparation: text(2000).default(''), active: z.boolean() }).strict().refine((value) => !value.external || !!value.provider, { path: ['provider'], message: 'Name the external provider.' })
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const scheduleInput = z.object({ version: version.optional(), weekly: z.array(z.object({ day: z.number().int().min(0).max(6), start: time, end: time }).strict()).max(28), leave: z.array(z.object({ from: date, through: date, reason: text(160).min(2) }).strict()).max(100) }).strict().superRefine((value, ctx) => {
  value.weekly.forEach((slot, i) => {
    if (slot.start >= slot.end || value.weekly.some((other, j) => j < i && other.day === slot.day && other.start < slot.end && slot.start < other.end)) ctx.addIssue({ code: 'custom', path: ['weekly', i], message: 'Working periods must have positive duration and cannot overlap.' })
  })
  value.leave.forEach((entry, i) => { if (entry.from > entry.through) ctx.addIssue({ code: 'custom', path: ['leave', i], message: 'Leave end must follow its start.' }) })
})
export const accountInput = z.object({ role: z.enum(['admin', 'staff', 'doctor']), permissions: z.array(z.enum(['assess', 'diagnostics', 'dispense'])).max(3), doctorId: z.union([id, z.literal('')]).default('') }).strict().refine((value) => value.role !== 'doctor' || !!value.doctorId, { path: ['doctorId'], message: 'Link a doctor directory record.' })
export const invitationInput = z.object({
  ...accountInput.shape,
  email: z.email().max(254).transform((value) => value.toLowerCase()).refine((value) => !emailDomainError(value), { message: 'This email domain is not allowed. Use your personal or clinic email address.' }),
  newDoctor: z.object({ name: z.string().trim().min(2).max(100), specialty: z.string().trim().min(2).max(100), phone: phoneSchema.default('') }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.role === 'doctor' && !value.doctorId && !value.newDoctor) context.addIssue({ code: 'custom', path: ['doctorId'], message: 'Choose an existing doctor or enter the new doctor’s details.' })
  if (value.newDoctor && (value.role !== 'doctor' || value.doctorId)) context.addIssue({ code: 'custom', path: ['newDoctor'], message: 'Create a new doctor or select an existing record, not both.' })
})
export const orderInput = z.object({ encounterId: id, serviceId: id, requestId, repeatAcknowledged: z.boolean().default(false), repeatOf: id.optional(), repeatReason: text(500).default('') }).strict().superRefine((value, ctx) => {
  if (value.repeatAcknowledged && (!value.repeatOf || value.repeatReason.length < 5)) ctx.addIssue({ code: 'custom', path: ['repeatReason'], message: 'Confirm the existing request and enter a repeat reason of at least 5 characters.' })
  if (!value.repeatAcknowledged && (value.repeatOf || value.repeatReason)) ctx.addIssue({ code: 'custom', path: ['repeatReason'], message: 'Confirm an intentional repeat before supplying a repeat reason.' })
})
export const orderAction = z.object({ version, stage: z.enum(['scheduled', 'performed', 'reviewed', 'cancelled']), note: text(2000).default(''), scheduledAt: z.iso.datetime({ offset: true }).optional() }).strict()
export const reportInput = z.object({ version, name: text(120).min(1), provider: text(160).min(2), reportDate: date.refine((value) => value <= clinicDate(), 'Report date cannot be in the future.'), mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']), content: z.string().max(4 * 1024 * 1024) }).strict()
export const paymentInput = z.object({ version, requestId, amountCentavos: z.number().int().positive().max(100000000), method: z.enum(['cash', 'gcash']), reference: text(MAX_PAYMENT_REFERENCE_LENGTH).regex(PAYMENT_REFERENCE_PATTERN, 'Use letters, numbers, spaces, hyphens, underscores, or slashes.').default(''), refund: z.boolean().default(false), reason: text(500).default('') }).strict().refine((value) => !value.refund || value.reason.length >= 2, { path: ['reason'], message: 'Explain the refund.' }).refine((value) => value.method !== 'gcash' || value.reference.length > 0, { path: ['reference'], message: 'Enter the GCash transaction reference.' })
export const chargeInput = z.object({ version, serviceId: id.optional(), movementId: id.optional(), unitCentavos: z.number().int().min(0).max(100000000).optional() }).strict().refine((value) => !!value.serviceId !== !!value.movementId, 'Select a service or a medicine dispensing entry.')
export const actionInput = z.object({ version, action: z.enum(['start', 'left', 'priority', 'normal']), note: text(500).default('') }).strict()
