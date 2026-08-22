// Proxy for the Pending CMS "Renew" button. Forwards { companyId, credentialId }
// to POST {TRACKVID_API_URL}/system-admin/delhivery/renew-session, which asks
// Automated-scripts to run a fresh Puppeteer + Keycloak login and cache the
// harvested refresh_token on that credential.

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
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/delhivery/renew-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null)
  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}
