// Proxy for the Pending CMS "Renew" button. Forwards { companyId, credentialId }
// to POST {TRACKVID_API_URL}/system-admin/ajio/renew-session, which asks
// Automated-scripts to run a fresh AJIO Puppeteer + Reliance-SSO login and
// cache the harvested cookie jar + userId + pobIds on that credential.
//
// This route blocks for the length of a full AJIO login (~30-60s in the happy
// path, more if the account trips an Akamai bot check). Next's fetch has no
// default timeout, so the request rides until the BE's own 240s ceiling
// answers; `maxDuration` keeps the serverless runtime from cutting it short.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

export const maxDuration = 300

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

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/ajio/renew-session`, {
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
