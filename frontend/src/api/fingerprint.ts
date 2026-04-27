import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { useEffect, useState } from 'react'

let fpPromise: ReturnType<typeof FingerprintJS.load> | null = null

function getFpInstance() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load()
  }
  return fpPromise
}

export async function getFingerprint(): Promise<string> {
  const fp = await getFpInstance()
  const result = await fp.get()
  return result.visitorId
}

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFingerprint()
      .then(setFingerprint)
      .catch(() => setFingerprint(null))
      .finally(() => setLoading(false))
  }, [])

  return { fingerprint, loading }
}
