export function normalizeServerlessQuery(request) {
  // Vercel's /api/:path* rewrite can add its captured path to the URL query.
  // It is routing metadata, not a user-supplied directory filter. Remove only
  // the exact matching capture; preserve unrelated/duplicate parameters so the
  // API's strict validators continue rejecting malformed requests.
  const url = new URL(request.url || '/', 'http://localhost')
  const captures = url.searchParams.getAll('path')
  const route = decodeURIComponent(url.pathname.replace(/^\/api\/?/, ''))
  if (url.pathname.startsWith('/api/') && captures.length === 1 && captures[0] === route) {
    url.searchParams.delete('path')
    request.url = `${url.pathname}${url.search}`
  }
  // Express 5 parses the current URL through its prototype getter. Vercel's
  // own helper may have captured the URL before the rewrite was normalized.
  if (Object.getOwnPropertyDescriptor(request, 'query')?.configurable) delete request.query
}

// One application and connection pool per warm function instance. Share cold
// starts between concurrent requests and allow a failed startup to retry.
export function createServerlessHandler({ initialize, ensureConnected }) {
  let application
  return async (request, response) => {
    try {
      normalizeServerlessQuery(request)
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
