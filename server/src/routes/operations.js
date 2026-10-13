import { Router } from 'express'
import mongoose from 'mongoose'
import { randomBytes, createHash } from 'node:crypto'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission, assertAssigned } from '../middleware/permissions.js'
import { can } from '../../../shared/permissions.js'
import { User, publicUser } from '../models/User.js'
import { Doctor } from '../models/Doctor.js'
import { Session } from '../models/Session.js'
import { Appointment } from '../models/Appointment.js'
import { DoctorSchedule, ClinicService, DiagnosticOrder, DiagnosticReport, Invoice, Invitation, AuditEvent } from '../models/Operations.js'
import { validate } from '../validators/auth.js'
import { recordIdSchema as id } from '../validators/records.js'
import { accountInput, serviceInput, scheduleInput, orderInput, orderAction, reportInput, version } from '../validators/workflow.js'
import { HttpError } from '../utils/errors.js'
import { plain, actor, event, digest, conflict, checkVersion, saveVersion, getEncounter, availableSlots, scheduleAllows } from '../services/workflow.js'
import { clinicDate, validDate } from '../utils/clinicTime.js'

export function operationRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService))
  router.param('id', (request, _response, next, value) => { validate(id, value); next() })
  router.get('/accounts', requirePermission('accounts'), async (_request, response) => {
    const users = await User.find().sort({ name: 1 }).limit(500)
    response.json({ records: users.map(publicUser) })
  })
  async function checkDoctor(input, session = null) {
    if (input.role === 'doctor' && !await Doctor.exists({ _id: input.doctorId, archivedAt: null }).session(session)) throw new HttpError(400, 'Choose an active doctor directory record.')
  }
  router.post('/invitations', requirePermission('accounts'), async (request, response) => {
    const { email, ...input } = validate(z.object({ ...accountInput.shape, email: z.email().max(254).transform((value) => value.toLowerCase()) }).strict(), request.body)
    validate(accountInput, input); await checkDoctor(input)
    if (await User.exists({ email })) throw new HttpError(409, 'This email already has an account.')
    if (input.role === 'doctor' && await User.exists({ doctorId: input.doctorId })) throw new HttpError(409, 'This doctor already has an account.')
    const code = randomBytes(32).toString('hex')
    await mongoose.connection.transaction(async (session) => {
      await Invitation.deleteMany({ email, usedAt: null }, { session })
      await Invitation.create([{ ...input, doctorId: input.role === 'doctor' ? input.doctorId : null, email, tokenHash: createHash('sha256').update(code).digest('hex'), expiresAt: new Date(Date.now() + 48 * 3600000), createdBy: request.auth.user.id }], { session })
      await AuditEvent.create([{ action: 'invitation_created', target: email, actor: actor(request.auth.user), detail: input.role }], { session })
    })
    response.status(201).json({ code, expiresInHours: 48 })
  })
  router.patch('/accounts/:id', requirePermission('accounts'), async (request, response) => {
    const { version: loadedVersion, active, ...input } = validate(z.object({ ...accountInput.shape, version, active: z.boolean() }).strict(), request.body)
    validate(accountInput, input)
    if (request.params.id === request.auth.user.id) throw new HttpError(400, 'Ask another administrator to change your access. You cannot deactivate or change your own privileges.')
    await checkDoctor(input)
    let user
    try {
      await mongoose.connection.transaction(async (session) => {
        const administrator = await User.updateOne({ _id: request.auth.user.id, role: 'admin', active: { $ne: false } }, { $inc: { __v: 1 } }, { session })
        if (!administrator.matchedCount) throw new HttpError(403, 'Your administrator access has changed. Sign in again.')
        user = await User.findOneAndUpdate({ _id: request.params.id, __v: loadedVersion }, { $set: { ...input, doctorId: input.role === 'doctor' ? input.doctorId : null, active }, $inc: { __v: 1 } }, { session, returnDocument: 'after', runValidators: true })
        if (!user) conflict()
        await Session.deleteMany({ userId: user.id }, { session })
        await AuditEvent.create([{ action: 'account_access_changed', target: user.id, actor: actor(request.auth.user), detail: `${input.role}; active=${active}` }], { session })
      })
    } catch (error) { if (error.code === 11000) throw new HttpError(409, 'This doctor already has an account.'); throw error }
    response.json({ record: publicUser(user) })
  })
  router.get('/audit', requirePermission('accounts'), async (_request, response) => response.json({ records: (await AuditEvent.find().sort({ at: -1 }).limit(100)).map(plain) }))
  router.get('/schedules/:id', requirePermission('directory'), async (request, response) => {
    const record = await DoctorSchedule.findOne({ doctorId: request.params.id })
    response.json({ record: record ? plain(record) : null })
  })
  router.get('/slots/:id', requirePermission('directory'), async (request, response) => {
    const date = validate(z.string().refine(validDate), request.query.date)
    response.json(await availableSlots(request.params.id, date))
  })
  router.put('/schedules/:id', requirePermission('schedule'), async (request, response) => {
    const input = validate(scheduleInput, request.body)
    let record
    try {
      await mongoose.connection.transaction(async (session) => {
        if (!await Doctor.exists({ _id: request.params.id, archivedAt: null }).session(session)) throw new HttpError(404, 'Active doctor not found.')
        record = await DoctorSchedule.findOne({ doctorId: request.params.id }).session(session)
        if (record) checkVersion(record, input.version)
        else if (input.version !== undefined) conflict()
        const appointments = await Appointment.find({ doctorId: request.params.id, status: 'scheduled', startsAt: { $gt: new Date() } }).session(session)
        for (const appointment of appointments) {
          const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(appointment.startsAt)
          if (!scheduleAllows(input, clinicDate(appointment.startsAt), time)) throw new HttpError(409, 'These hours conflict with an existing future appointment. Reschedule or cancel that booking first.')
        }
        if (!record) record = new DoctorSchedule({ doctorId: request.params.id })
        record.weekly = input.weekly; record.leave = input.leave; record.updatedBy = request.auth.user.id; record.revision += 1
        await saveVersion(record, session)
        await AuditEvent.create([{ action: 'schedule_updated', target: request.params.id, actor: actor(request.auth.user) }], { session })
      })
    } catch (error) { if (error.code === 11000) conflict(); throw error }
    response.json({ record: plain(record) })
  })
  router.get('/services', requirePermission('directory'), async (request, response) => {
    const q = validate(z.string().max(100), request.query.q || '')
    const filter = can(request.auth.user, 'catalog') ? {} : { active: true }
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    response.json({ records: (await ClinicService.find(filter).sort({ category: 1, name: 1 }).limit(500)).map(plain) })
  })
  router.post('/services', requirePermission('catalog'), async (request, response) => {
    try { response.status(201).json({ record: plain(await ClinicService.create({ ...validate(serviceInput, request.body), updatedBy: request.auth.user.id })) }) }
    catch (error) { if (error.code === 11000) throw new HttpError(409, 'That service code is already used.'); throw error }
  })
  router.patch('/services/:id', requirePermission('catalog'), async (request, response) => {
    const { version: loadedVersion, ...input } = validate(serviceInput.safeExtend({ version }), request.body)
    try {
      const record = await ClinicService.findOneAndUpdate({ _id: request.params.id, __v: loadedVersion }, { $set: { ...input, updatedBy: request.auth.user.id }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true })
      if (!record) conflict()
      response.json({ record: plain(record) })
    } catch (error) { if (error.code === 11000) throw new HttpError(409, 'That service code is already used.'); throw error }
  })
  router.get('/orders', requirePermission('clinical', 'diagnostics', 'reception'), async (request, response) => {
    const filter = {}
    if (request.query.encounterId) filter.encounterId = validate(id, request.query.encounterId)
    if (request.auth.user.role === 'doctor') {
      if (!request.auth.user.doctorId) return response.json({ records: [] })
      filter.doctorId = request.auth.user.doctorId
    }
    const records = await DiagnosticOrder.find(filter).populate('encounterId', 'patientName patientNumber').sort({ createdAt: -1 }).limit(200)
    response.json({ records: records.map((record) => {
      const item = plain(record); delete item.requestDigest
      item.patientName = record.encounterId?.patientName || 'Patient unavailable'
      item.patientNumber = record.encounterId?.patientNumber || ''
      item.encounterId = String(record.encounterId?._id || record.encounterId)
      if (!can(request.auth.user, 'clinical') && !can(request.auth.user, 'diagnostics')) { delete item.reviewNote; delete item.reports; delete item.history }
      return item
    }) })
  })
  router.post('/orders', requirePermission('clinical', 'reception'), async (request, response) => {
    const input = validate(orderInput, request.body)
    const existing = await DiagnosticOrder.findOne({ requestId: input.requestId })
    if (existing) {
      if (existing.requestDigest !== digest(input) || String(existing.createdBy) !== request.auth.user.id) conflict()
      return response.json({ record: plain(existing) })
    }
    let record
    try {
      await mongoose.connection.transaction(async (session) => {
        const encounter = await getEncounter(input.encounterId, request.auth.user, session)
        if (encounter.stage === 'left') throw new HttpError(409, 'This patient left before being seen.')
        if (encounter.kind !== 'external_test' && !can(request.auth.user, 'clinical')) throw new HttpError(403, 'A doctor must request tests for a consultation.')
        const service = await ClinicService.findOne({ _id: input.serviceId, active: true }).session(session)
        if (!service || !['laboratory', 'imaging', 'diagnostic'].includes(service.category)) throw new HttpError(400, 'Choose an available diagnostic service.')
        ;[record] = await DiagnosticOrder.create([{ ...input, patientId: encounter.patientId, doctorId: encounter.doctorId, serviceName: service.name, category: service.category, priceCentavos: service.priceCentavos, external: service.external, provider: service.provider, requestDigest: digest(input), createdBy: request.auth.user.id, history: [event(request.auth.user, 'requested')] }], { session })
        if (!service.external) await Invoice.updateOne({ encounterId: encounter.id }, { $push: { lines: { sourceKey: `order:${record.id}`, description: service.name, quantity: 1, unitCentavos: service.priceCentavos, actor: actor(request.auth.user) } }, $inc: { __v: 1 } }, { session })
      })
    } catch (error) { if (error.code === 11000) conflict(); throw error }
    response.status(201).json({ record: plain(record) })
  })
  router.patch('/orders/:id', requirePermission('clinical', 'diagnostics'), async (request, response) => {
    const input = validate(orderAction, request.body)
    const record = await DiagnosticOrder.findById(request.params.id)
    if (!record) throw new HttpError(404, 'Test request not found.')
    assertAssigned(request.auth.user, record.doctorId); checkVersion(record, input.version)
    const allowed = { requested: ['scheduled', 'performed', 'cancelled'], scheduled: ['scheduled', 'performed', 'cancelled'], performed: [], result_available: ['reviewed'], reviewed: [], cancelled: [] }
    if (!allowed[record.stage].includes(input.stage)) throw new HttpError(409, 'This test cannot move to that stage.')
    if (input.stage === 'reviewed') {
      if (!can(request.auth.user, 'clinical') || !input.note) throw new HttpError(403, 'The doctor must enter a result review note.')
      record.reviewNote = input.note
    } else if (!can(request.auth.user, 'diagnostics') && !(input.stage === 'cancelled' && can(request.auth.user, 'clinical'))) throw new HttpError(403, 'Diagnostic processing permission is required.')
    if (input.stage === 'scheduled') {
      if (!input.scheduledAt || new Date(input.scheduledAt) <= new Date()) throw new HttpError(400, 'Choose a future examination time.')
      record.scheduledAt = input.scheduledAt
    }
    if (input.stage === 'cancelled' && !input.note) throw new HttpError(400, 'Record a cancellation reason. Any existing charge must be reconciled separately in billing.')
    record.stage = input.stage; record.history.push(event(request.auth.user, input.stage, input.note)); await saveVersion(record)
    response.json({ record: plain(record) })
  })
  router.post('/orders/:id/reports', requirePermission('diagnostics'), async (request, response) => {
    const input = validate(reportInput, request.body)
    const bytes = decodeReport(input)
    let reportId
    await mongoose.connection.transaction(async (session) => {
      const order = await DiagnosticOrder.findById(request.params.id).session(session)
      if (!order) throw new HttpError(404, 'Test request not found.')
      assertAssigned(request.auth.user, order.doctorId); checkVersion(order, input.version)
      if (!['performed', 'result_available', 'reviewed'].includes(order.stage) || order.reports.length >= 5) throw new HttpError(409, 'Mark the test performed before attaching results. At most five report revisions are allowed.')
      const [report] = await DiagnosticReport.create([{ name: input.name, mime: input.mime, bytes, provider: input.provider, reportDate: input.reportDate, actor: actor(request.auth.user) }], { session })
      reportId = report.id; order.reports.push(report.id); order.stage = 'result_available'; order.reviewNote = ''
      order.history.push(event(request.auth.user, 'report_attached', input.name)); await saveVersion(order, session)
    })
    response.status(201).json({ id: reportId })
  })
  router.get('/reports/:id', requirePermission('clinical', 'diagnostics'), async (request, response) => {
    const order = await DiagnosticOrder.findOne({ reports: request.params.id })
    if (!order) throw new HttpError(404, 'Report not found.')
    assertAssigned(request.auth.user, order.doctorId)
    const report = await DiagnosticReport.findById(request.params.id).select('+bytes')
    if (!report) throw new HttpError(404, 'Report not found.')
    const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[report.mime]
    response.set({ 'Content-Type': report.mime, 'Content-Disposition': `attachment; filename="report-${report.id}.${extension}"`, 'X-Content-Type-Options': 'nosniff' }).send(report.bytes)
  })
  return router
}
export function decodeReport(input) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.content)) throw new HttpError(400, 'Invalid report encoding.')
  const bytes = Buffer.from(input.content, 'base64')
  const valid = input.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : input.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!valid || bytes.length > 5 * 1024 * 1024) throw new HttpError(400, 'Use a PDF, PNG, or JPEG report of at most 5 MB with a matching file type.')
  return bytes
}
