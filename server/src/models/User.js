import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '', maxlength: 30 },
  gender: { type: String, enum: ['', 'female', 'male', 'non_binary', 'other', 'prefer_not_to_say'], default: '' },
  dateOfBirth: { type: String, default: '', maxlength: 10 },
  jobTitle: { type: String, trim: true, default: '', maxlength: 100 },
  department: { type: String, trim: true, default: '', maxlength: 100 },
  workLocation: { type: String, trim: true, default: '', maxlength: 160 },
  role: { type: String, enum: ['admin', 'staff', 'doctor'], default: 'staff' },
  permissions: { type: [String], enum: ['assess', 'diagnostics', 'dispense'], default: [] },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true })
userSchema.index({ doctorId: 1 }, { unique: true, partialFilterExpression: { doctorId: { $type: 'objectId' } } })

export const User = mongoose.model('User', userSchema)

export function publicUser(user) {
  return {
    id: String(user._id), name: user.name, email: user.email,
    phone: user.phone || '', gender: user.gender || '', dateOfBirth: user.dateOfBirth || '',
    jobTitle: user.jobTitle || '', department: user.department || '', workLocation: user.workLocation || '',
    role: user.role, permissions: user.permissions || [], active: user.active !== false, doctorId: user.doctorId?.toString() || null,
    version: user.__v, createdAt: user.createdAt, updatedAt: user.updatedAt,
  }
}
