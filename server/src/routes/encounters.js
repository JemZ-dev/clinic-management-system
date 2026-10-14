import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/permissions.js'
import { Encounter } from '../models/Encounter.js'
import { ClinicService, Invoice } from '../models/Operations.js'
import { StockMovement } from '../models/StockMovement.js'
import { validate } from '../validators/auth.js'
import { recordIdSchema as id } from '../validators/records.js'
import { encounterInput, assessmentInput, draftInput, actionInput, version, paymentInput, chargeInput } from '../validators/workflow.js'
import { actor, checkVersion, conflict, saveVersion, plain, getEncounter, publicEncounter, createEncounter, assessEncounter, encounterAction, saveDraft, finalizeEncounter, invoiceTotals } from '../services/workflow.js'
import { HttpError } from '../utils/errors.js'
import { billingListSchema, listBills } from '../services/billingDirectory.js'

export function encounterRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requirePermission('directory'))
  router.param('id', (request, _response, next, value) => { validate(id, value); next() })
  router.get('/', async (request, response) => {
    const query = validate(z.object({ q: z.string().max(100).default(''), stage: z.enum(['active', 'all', 'awaiting_assessment', 'waiting', 'in_consultation', 'finished', 'left']).default('active'), patientId: id.optional(), appointmentId: id.optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict(), request.query)
    const filter = {}
    if (request.auth.user.role === 'doctor') {
      if (!request.auth.user.doctorId) return response.json({ records: [], pagination: { page: 1, pages: 1, total: 0, limit: 25 } })
      filter.doctorId = request.auth.user.doctorId
    }
    if (query.patientId) filter.patientId = query.patientId
    if (query.appointmentId) filter.appointmentId = query.appointmentId
    if (query.stage === 'active') filter.stage = { $nin: ['finished', 'left'] }
    else if (query.stage !== 'all') filter.stage = query.stage
    if (query.q) { const regex = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; filter.$or = [{ patientName: regex }, { patientNumber: regex }, { doctorName: regex }] }
    const total = await Encounter.countDocuments(filter), pages = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pages)
    const records = await Encounter.find(filter).sort(query.stage === 'active' ? { priority: -1, arrivedAt: 1, _id: 1 } : { arrivedAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25)
    response.json({ records: records.map((item) => publicEncounter(item, request.auth.user, true)), pagination: { page, pages, limit: 25, total } })
  })
  router.post('/', requirePermission('reception'), async (request, response) => response.status(201).json({ record: publicEncounter(await createEncounter(validate(encounterInput, request.body), request.auth.user), request.auth.user) }))
  router.get('/:id', async (request, response) => response.json({ record: publicEncounter(await getEncounter(request.params.id, request.auth.user), request.auth.user) }))
  router.post('/:id/assessment', requirePermission('assess'), async (request, response) => response.json({ record: publicEncounter(await assessEncounter(request.params.id, validate(assessmentInput, request.body), request.auth.user), request.auth.user) }))
  router.post('/:id/action', async (request, response) => response.json({ record: publicEncounter(await encounterAction(request.params.id, validate(actionInput, request.body), request.auth.user), request.auth.user) }))
  router.put('/:id/draft', requirePermission('clinical'), async (request, response) => response.json({ record: publicEncounter(await saveDraft(request.params.id, validate(draftInput, request.body), request.auth.user), request.auth.user) }))
  router.post('/:id/finalize', requirePermission('clinical'), async (request, response) => {
    const input = validate(z.object({ version }).strict(), request.body)
    response.json({ record: publicEncounter(await finalizeEncounter(request.params.id, input.version, request.auth.user), request.auth.user) })
  })
  router.get('/:id/invoice', requirePermission('billing'), async (request, response) => {
    await getEncounter(request.params.id, request.auth.user)
    const record = await Invoice.findOne({ encounterId: request.params.id })
    if (!record) throw new HttpError(404, 'Bill not found.')
    response.json({ record: { ...plain(record), ...invoiceTotals(record) } })
  })
  router.post('/:id/charges', requirePermission('billing'), async (request, response) => {
    const input = validate(chargeInput, request.body)
    await mongoose.connection.transaction(async (session) => {
      const encounter = await getEncounter(request.params.id, request.auth.user, session)
      const invoice = await Invoice.findOne({ encounterId: encounter.id }).session(session)
      checkVersion(invoice, input.version)
      if (invoice.lines.length >= 100) throw new HttpError(400, 'A bill can have at most 100 charge entries.')
      let sourceKey, description, quantity = 1, unitCentavos
      if (input.serviceId) {
        const service = await ClinicService.findById(input.serviceId).session(session)
        if (!service?.active || service.external || !['consultation', 'procedure'].includes(service.category)) throw new HttpError(400, 'Choose an active in-house consultation or procedure. Diagnostic charges come from test requests.')
        sourceKey = `service:${service.id}`; description = service.name; unitCentavos = service.priceCentavos
      } else {
        const movement = await StockMovement.findById(input.movementId).session(session)
        if (!movement || movement.type !== 'dispense' || !encounter.visitId || String(movement.visitId) !== String(encounter.visitId) || input.unitCentavos === undefined) throw new HttpError(400, 'Select a dispensing entry from this consultation and enter its unit selling price.')
        sourceKey = `movement:${movement.id}`; description = `${movement.medicineSnapshot.genericName} ${movement.medicineSnapshot.strength}`; quantity = Math.abs(movement.quantity); unitCentavos = input.unitCentavos
      }
      if (invoice.lines.some((line) => line.sourceKey === sourceKey && !line.voided)) throw new HttpError(409, 'This item is already on the bill.')
      invoice.lines.push({ sourceKey, description, quantity, unitCentavos, actor: actor(request.auth.user) }); await saveVersion(invoice, session)
    })
    response.status(201).json({ saved: true })
  })
  router.post('/:id/void-charge', requirePermission('billing'), async (request, response) => {
    const input = validate(z.object({ version, lineId: id, reason: z.string().trim().min(2).max(500) }).strict(), request.body)
    const invoice = await Invoice.findOne({ encounterId: request.params.id })
    if (!invoice) throw new HttpError(404, 'Bill not found.')
    checkVersion(invoice, input.version)
    const line = invoice.lines.id(input.lineId)
    if (!line || line.voided) throw new HttpError(409, 'This charge is already void or does not exist.')
    const totals = invoiceTotals(invoice)
    if (totals.paidCentavos > totals.totalCentavos - line.quantity * line.unitCentavos) throw new HttpError(409, 'Record the required refund before voiding this charge.')
    line.voided = true; line.voidReason = input.reason; line.actor = actor(request.auth.user); await saveVersion(invoice)
    response.json({ saved: true })
  })
  router.post('/:id/payments', requirePermission('billing'), async (request, response) => {
    const input = validate(paymentInput, request.body)
    const invoice = await Invoice.findOne({ encounterId: request.params.id })
    if (!invoice) throw new HttpError(404, 'Bill not found.')
    const retry = invoice.payments.find((item) => item.requestId === input.requestId)
    if (retry) {
      if (retry.amountCentavos !== input.amountCentavos || retry.refund !== input.refund || retry.method !== input.method || retry.reference !== input.reference || retry.reason !== input.reason || String(retry.actor.id) !== request.auth.user.id) conflict()
      return response.json({ saved: true })
    }
    checkVersion(invoice, input.version)
    if (invoice.payments.length >= 100) throw new HttpError(400, 'Payment history is full.')
    const totals = invoiceTotals(invoice)
    if (input.amountCentavos > (input.refund ? totals.paidCentavos : totals.balanceCentavos)) throw new HttpError(400, input.refund ? 'Refund cannot exceed payments received.' : 'Payment cannot exceed the outstanding balance.')
    invoice.payments.push({ ...input, actor: actor(request.auth.user) }); await saveVersion(invoice)
    response.status(201).json({ saved: true })
  })
  return router
}

export function billingRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requirePermission('billing'))
  router.get('/', async (request, response) => response.json(await listBills(validate(billingListSchema, request.query))))
  return router
}
