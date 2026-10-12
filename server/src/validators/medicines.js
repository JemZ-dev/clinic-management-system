import { z } from 'zod'
import { recordIdSchema, versionSchema, listSchema } from './records.js'

const text = (max) => z.string().trim().max(max, `Use ${max} characters or fewer.`)
export const medicineSchema = z.object({
  genericName: text(100).min(2, 'Enter the generic name.'), brandName: text(100).default(''),
  strength: text(80).min(1, 'Enter the strength.'), dosageForm: text(80).min(2, 'Enter the dosage form.'),
  stockUnit: text(40).min(2, 'Enter the stock unit.'), notes: text(2000).default(''),
  lowStockThreshold: z.number().int().min(0).max(1000000000).default(0),
}).strict()
export const medicineUpdateSchema = medicineSchema.extend({ version: versionSchema.shape.version })
export const medicineListSchema = listSchema.extend({ stock: z.enum(['all', 'low', 'available', 'out']).default('all') })
export const prescriptionSchema = z.object({
  medicineId: recordIdSchema, productKey: z.string().regex(/^[a-f0-9]{64}$/),
  quantity: z.number().int().min(1, 'Enter at least one stock unit.').max(1000000),
  instructions: text(1000).min(2, 'Record the clinician’s prescription instructions.'),
}).strict()
export const stockMovementSchema = z.object({
  requestId: z.uuid(), version: versionSchema.shape.version, type: z.enum(['receipt', 'adjustment', 'dispense']),
  quantity: z.number().int('Use a whole number of stock units.').min(-1000000).max(1000000), note: text(500).default(''),
  visitId: recordIdSchema.optional(), prescriptionId: recordIdSchema.optional(), visitVersion: versionSchema.shape.version.optional(),
}).strict().superRefine((data, context) => {
  const issue = (path, message) => context.addIssue({ code: 'custom', path: [path], message })
  if (data.quantity === 0 || (data.type !== 'adjustment' && data.quantity < 1)) issue('quantity', data.type === 'adjustment' ? 'Enter a non-zero adjustment.' : 'Enter a positive quantity.')
  if (data.type === 'adjustment' && data.note.length < 2) issue('note', 'Explain the stock adjustment.')
  if (data.type === 'dispense' && (!data.visitId || !data.prescriptionId || data.visitVersion === undefined)) issue('visitId', 'Dispensing requires a saved visit, its loaded version, and a prescription line.')
  if (data.type !== 'dispense' && (data.visitId || data.prescriptionId || data.visitVersion !== undefined)) issue('visitId', 'Only dispensing can link to a prescription.')
})
export const movementListSchema = z.object({
  q: text(100).default(''), type: z.enum(['all', 'receipt', 'adjustment', 'dispense']).default('all'),
  medicineId: recordIdSchema.optional(), visitId: recordIdSchema.optional(),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1), limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict()
