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
  // This milestone has one permission level. Registration never accepts a role.
  role: { type: String, enum: ['staff'], default: 'staff', immutable: true },
}, { timestamps: true })

export const User = mongoose.model('User', userSchema)

export function publicUser(user) {
  return {
    id: String(user._id), name: user.name, email: user.email,
    phone: user.phone || '', gender: user.gender || '', dateOfBirth: user.dateOfBirth || '',
    jobTitle: user.jobTitle || '', department: user.department || '', workLocation: user.workLocation || '',
    role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt,
  }
}
