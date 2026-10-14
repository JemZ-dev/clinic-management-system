// Vite may choose any free port. Validate that the browser is using this
// frontend, then forward the API's configured origin through the local proxy.
export function localApiOrigin(appOrigin) {
  return {
    name: 'clinic-local-api-origin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api') || !request.headers.origin) return next()
        const address = server.httpServer?.address()
        const port = address && typeof address === 'object' ? address.port : null
        const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
        if (!port || !origins.includes(request.headers.origin)) {
          response.writeHead(403, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ message: 'This request is not allowed.' }))
          return
        }
        request.headers.origin = appOrigin
        next()
      })
    },
  }
}
