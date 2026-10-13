import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import { Invitation, AuditEvent, DoctorSchedule, Invoice } from '../src/models/Operations.js'
import { Encounter } from '../src/models/Encounter.js'

export async function inviteFixture(email, code, role = 'staff', permissions = []) {
  await Promise.all([Invitation.init(), AuditEvent.init(), DoctorSchedule.init(), Invoice.init(), Encounter.init()])
  await Invitation.create({ email, tokenHash: createHash('sha256').update(code).digest('hex'), role, permissions, expiresAt: new Date(Date.now() + 3600000), createdBy: new mongoose.Types.ObjectId() })
}
export async function scheduleFixture(doctors) {
  await DoctorSchedule.create(doctors.map((doctor) => ({ doctorId: doctor.id, weekly: Array.from({ length: 7 }, (_, day) => ({ day, start: '00:00', end: '23:30' })), updatedBy: doctor.createdBy })))
}
