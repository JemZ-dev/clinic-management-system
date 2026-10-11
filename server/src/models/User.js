import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '', maxlength: 30 },
  // This milestone has one permission level. Registration never accepts a role.
  role: { type: String, enum: ['staff'], default: 'staff', immutable: true },
}, { timestamps: true })

export const User = mongoose.model('User', userSchema)

export function publicUser(user) {
  return {
    id: String(user._id), name: user.name, email: user.email,
    phone: user.phone, role: user.role, createdAt: user.createdAt,
  }
}
