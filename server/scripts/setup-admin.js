import { User } from '../src/models/User.js'
import { Session } from '../src/models/Session.js'
import { AuditEvent } from '../src/models/Operations.js'
import { connectDatabase, disconnectDatabase } from '../src/config/db.js'
import { loadLocalEnvironment, getConfig } from '../src/config/env.js'

// Local operator action only: promote an explicitly selected existing account.
const email = process.argv[2]?.trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: npm --prefix server run setup:admin -- existing-account@example.com')
  process.exitCode = 1
} else {
  try {
    loadLocalEnvironment(); await connectDatabase(getConfig())
    const user = await User.findOne({ email })
    if (!user) throw new Error('No existing account has that email. No records changed.')
    user.role = 'admin'; user.active = true; user.doctorId = null
    await user.save()
    await Session.deleteMany({ userId: user.id })
    await AuditEvent.create({ action: 'administrator_bootstrapped_locally', target: user.id, actor: { id: user.id, name: user.name } })
    console.log('Administrator access assigned to the selected existing account. Sign in again.')
  } catch (error) { console.error(error.message === 'No existing account has that email. No records changed.' ? error.message : 'Administrator setup failed. Check database access; no credentials are printed.'); process.exitCode = 1 }
  finally { await disconnectDatabase() }
}
