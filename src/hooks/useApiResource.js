import { useEffect, useState } from 'react'
import { api, apiError } from '../lib/api.js'

export default function useApiResource(path) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const key = `${path}:${revision}`
  useEffect(() => {
    const controller = new AbortController()
    api.get(path, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ key, data })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key, error: apiError(error) })
    })
    return () => controller.abort()
  }, [key, path])
  return {
    loading: result?.key !== key,
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : '',
    reload: () => setRevision((value) => value + 1),
  }
}
