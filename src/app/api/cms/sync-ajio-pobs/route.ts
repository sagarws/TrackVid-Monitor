// Proxy for the credentials panel's AJIO "POBs" button. Forwards
// { companyId, credentialId } to POST {TRACKVID_API_URL}/system-admin/ajio/sync-pobs,
// which asks Automated-scripts to page through AJIO's pobsFromUserId API using
// the credential's cached session and then stores the distinct `parentId`
// values on that credential.
//
// Unlike renew-session this does NOT run a login: the runner reuses the cached
// jar and answers 409 (NO_SESSION / SESSION_EXPIRED) when there is nothing to
// reuse. So it returns in seconds, and a short maxDuration is enough — the BE's
// own ceiling is 90s.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

export const maxDuration = 120

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

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/ajio/sync-pobs`, {
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
