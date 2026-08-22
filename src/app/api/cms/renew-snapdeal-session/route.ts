// Proxy for the Pending CMS "Renew" button. Forwards { companyId, credentialId }
// to POST {TRACKVID_API_URL}/system-admin/snapdeal/renew-session, which asks
// Automated-scripts to run a fresh Snapdeal Puppeteer login and cache the
// harvested cookie jar on that credential.
//
// Snapdeal's login is faster than Flipkart's (no emailed OTP on the API path)
// but Puppeteer bootstrap still takes ~15-30s. The BE-side timeout caps at 120s.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

export const maxDuration = 180

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) {
    return NextResponse.json(
      { isSuccess: false, message: 'Not signed in', displayMessage: 'Session expired — please sign in again.' },
      { status: 401 }
    )
  }

  const apiBase = process.env.TRACKVID_API_URL

  if (!apiBase) {
    return NextResponse.json({ isSuccess: false, message: 'TRACKVID_API_URL not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/snapdeal/renew-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  })

  const json = await res.json().catch(() => null)

  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}
