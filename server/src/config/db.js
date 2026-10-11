import mongoose from 'mongoose'

mongoose.set('bufferCommands', false)
mongoose.connection.on('error', () => {
  // Never print driver error objects: they can contain connection details.
  console.error('MongoDB connection error.')
})

export async function connectDatabase({ uri, dbName }) {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
  })
  await pingDatabase()
}

export async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database unavailable')
  await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 3000 })
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
