import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { versionKey: false })

export const Session = mongoose.model('Session', sessionSchema)
