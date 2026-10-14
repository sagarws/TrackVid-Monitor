'use client'

// Auto-logout when the session dies under the operator. Every /api/* route is
// a proxy that forwards TrackVid-BE's status, so a 401 from any of them means
// the SystemAdmin token is missing or expired. Rather than each view showing
// "Unauthorized." in an alert, sign out once and land on the login page with
// a redirectTo back to where the operator was.

// React Imports
import { useEffect } from 'react'

// Next Imports
import { useParams } from 'next/navigation'

// Third-party Imports
import { signOut } from 'next-auth/react'

// next-auth's own endpoints answer 401 for a bad password — not an expiry.
const IGNORED_PREFIXES = ['/api/auth', '/api/login']

let signingOut = false

const isProxyCall = (input: RequestInfo | URL): boolean => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw, window.location.origin)

  if (url.origin !== window.location.origin) return false
  if (!url.pathname.startsWith('/api/')) return false

  return !IGNORED_PREFIXES.some(prefix => url.pathname.startsWith(prefix))
}

const AutoLogoutOn401 = () => {
  const { lang } = useParams<{ lang?: string }>()

  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async (input, init) => {
      const res = await originalFetch(input, init)

      if (res.status === 401 && !signingOut && isProxyCall(input)) {
        signingOut = true

        const locale = lang ?? 'en'
        const login = `/${locale}/login`
        const here = window.location.pathname
        const callbackUrl = here.startsWith(login) ? login : `${login}?redirectTo=${encodeURIComponent(here)}`

        signOut({ callbackUrl }).catch(() => {
          window.location.href = callbackUrl
        })
      }

      return res
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [lang])

  return null
}

export default AutoLogoutOn401
