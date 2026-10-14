import mongoose from 'mongoose'
import { z } from 'zod'
import { DiagnosticOrder } from '../models/Operations.js'
import { Encounter } from '../models/Encounter.js'
import { recordIdSchema } from '../validators/records.js'
import { clinicDayRange, validDate } from '../utils/clinicTime.js'
import { can } from '../../../shared/permissions.js'

const date = z.union([z.literal(''), z.string().refine(validDate)]).default('')
export const diagnosticListSchema = z.object({
  encounterId: recordIdSchema.optional(), q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'requested', 'scheduled', 'performed', 'result_available', 'reviewed', 'cancelled']).default('all'),
  category: z.enum(['all', 'laboratory', 'imaging', 'diagnostic']).default('all'),
  provider: z.enum(['all', 'in_house', 'external']).default('all'),
  from: date, through: date,
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).default(1),
  limit: z.enum(['10', '25', '50']).transform(Number).default(10),
}).strict().refine((value) => !value.from || !value.through || value.from <= value.through, { path: ['through'], message: 'End date must be on or after the start date.' })

export function diagnosticPipeline(filters, user) {
  const match = {}
  if (user.role === 'doctor') match.doctorId = new mongoose.Types.ObjectId(user.doctorId)
  if (filters.encounterId) match.encounterId = new mongoose.Types.ObjectId(filters.encounterId)
  if (filters.status !== 'all') match.stage = filters.status
  if (filters.category !== 'all') match.category = filters.category
  if (filters.provider !== 'all') match.external = filters.provider === 'external'
  if (filters.from || filters.through) match.createdAt = { ...(filters.from ? { $gte: clinicDayRange(filters.from).start } : {}), ...(filters.through ? { $lt: clinicDayRange(filters.through).end } : {}) }
  const q = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    { $match: match },
    { $lookup: { from: Encounter.collection.name, localField: 'encounterId', foreignField: '_id', as: 'encounter', pipeline: [{ $project: { patientName: 1, patientNumber: 1 } }] } },
    { $unwind: { path: '$encounter', preserveNullAndEmptyArrays: true } },
    ...(q ? [{ $match: { $or: ['serviceName', 'provider', 'encounter.patientName', 'encounter.patientNumber'].map((field) => ({ [field]: { $regex: q, $options: 'i' } })) } }] : []),
    { $sort: { createdAt: -1, _id: -1 } },
    { $facet: { records: [{ $skip: (filters.page - 1) * filters.limit }, { $limit: filters.limit }], count: [{ $count: 'total' }] } },
  ]
}

export async function listDiagnosticOrders(filters, user) {
  if (user.role === 'doctor' && !user.doctorId) return { records: [], pagination: { page: filters.page, limit: filters.limit, total: 0, pages: 1 } }
  const [result] = await DiagnosticOrder.aggregate(diagnosticPipeline(filters, user))
  const total = result?.count[0]?.total || 0
  const records = (result?.records || []).map(({ _id, __v, requestDigest: _requestDigest, encounter, ...record }) => {
    const item = { ...record, id: String(_id), version: __v, encounterId: String(record.encounterId), patientName: encounter?.patientName || 'Patient unavailable', patientNumber: encounter?.patientNumber || '' }
    if (!can(user, 'clinical') && !can(user, 'diagnostics')) { delete item.reviewNote; delete item.reports; delete item.history; delete item.repeatReason }
    return item
  })
  return { records, pagination: { page: filters.page, limit: filters.limit, total, pages: Math.max(1, Math.ceil(total / filters.limit)) } }
}
