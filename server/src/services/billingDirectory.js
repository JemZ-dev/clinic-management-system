import { z } from 'zod'
import { Invoice } from '../models/Operations.js'
import { Encounter } from '../models/Encounter.js'
import { clinicDayRange, validDate } from '../utils/clinicTime.js'

const date = z.union([z.literal(''), z.string().refine(validDate, 'Enter a real calendar date.')]).default('')
export const billingListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'unpaid', 'partially_paid', 'paid', 'no_charges']).default('all'),
  from: date, through: date,
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict().refine((value) => !value.from || !value.through || value.from <= value.through, { path: ['through'], message: 'End date must be on or after the start date.' })

export function billingPipeline(filters) {
  const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = {}
  if (escaped) match.$or = ['patientName', 'patientNumber'].map((field) => ({ [`encounterId.${field}`]: { $regex: escaped, $options: 'i' } }))
  if (filters.from || filters.through) match['encounterId.arrivedAt'] = {
    ...(filters.from ? { $gte: clinicDayRange(filters.from).start } : {}),
    ...(filters.through ? { $lt: clinicDayRange(filters.through).end } : {}),
  }
  return [
    { $lookup: { from: Encounter.collection.name, localField: 'encounterId', foreignField: '_id', as: 'encounterId', pipeline: [{ $project: { patientName: 1, patientNumber: 1, arrivedAt: 1 } }] } },
    { $unwind: { path: '$encounterId', preserveNullAndEmptyArrays: true } },
    { $match: match },
    { $set: { activeLines: { $filter: { input: '$lines', as: 'line', cond: { $ne: ['$$line.voided', true] } } } } },
    { $set: {
      totalCentavos: { $sum: { $map: { input: '$activeLines', as: 'line', in: { $multiply: ['$$line.quantity', '$$line.unitCentavos'] } } } },
      paidCentavos: { $sum: { $map: { input: '$payments', as: 'payment', in: { $cond: ['$$payment.refund', { $multiply: ['$$payment.amountCentavos', -1] }, '$$payment.amountCentavos'] } } } },
    } },
    { $set: { balanceCentavos: { $subtract: ['$totalCentavos', '$paidCentavos'] }, status: { $cond: [{ $eq: ['$totalCentavos', '$paidCentavos'] }, 'paid', { $cond: [{ $eq: ['$paidCentavos', 0] }, 'unpaid', 'partially_paid'] }] }, billingStatus: { $cond: [{ $eq: [{ $size: '$activeLines' }, 0] }, 'no_charges', { $cond: [{ $eq: ['$totalCentavos', '$paidCentavos'] }, 'paid', { $cond: [{ $eq: ['$paidCentavos', 0] }, 'unpaid', 'partially_paid'] }] }] } } },
    ...(filters.status === 'all' ? [] : [{ $match: { billingStatus: filters.status } }]),
    { $sort: { updatedAt: -1, _id: -1 } },
    { $project: { activeLines: 0 } },
    { $facet: { records: [{ $skip: (filters.page - 1) * filters.limit }, { $limit: filters.limit }], count: [{ $count: 'total' }] } },
  ]
}

export async function listBills(filters) {
  const [result] = await Invoice.aggregate(billingPipeline(filters))
  const total = result?.count[0]?.total || 0
  const records = (result?.records || []).map(({ _id, __v, ...record }) => ({ ...record, id: String(_id), version: __v }))
  return { records, pagination: { page: filters.page, limit: filters.limit, total, pages: Math.max(1, Math.ceil(total / filters.limit)) } }
}
