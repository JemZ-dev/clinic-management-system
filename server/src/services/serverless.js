// One application and connection pool per warm function instance. Share cold
// starts between concurrent requests and allow a failed startup to retry.
export function createServerlessHandler({ initialize, ensureConnected }) {
  let application
  return async (request, response) => {
    try {
      if (!application) {
        application = Promise.resolve().then(initialize).catch((error) => {
          application = undefined
          throw error
        })
      }
      const app = await application
      await ensureConnected()
      return app(request, response)
    } catch {
      response.setHeader('Cache-Control', 'no-store')
      response.status(503).json({ message: 'The clinic server is temporarily unavailable. Please try again shortly.' })
    }
  }
}
