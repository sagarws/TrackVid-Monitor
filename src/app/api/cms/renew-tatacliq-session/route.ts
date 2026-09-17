// Proxy for the Pending CMS "Renew" button. Forwards { companyId, credentialId }
// to POST {TRACKVID_API_URL}/system-admin/tatacliq/renew-session, which asks
// Automated-scripts to run a fresh Tata CliQ login and cache the harvested
// cookie jar AND slave list on that credential.
//
// WORTH RENEWING FROM HERE EVEN THOUGH THE CLAIM RUNS ON THE DESKTOP. Tata
// CliQ's sign-in spends an emailed code, and only the automation server can
// read that mailbox. So this button is how a dead session is replaced without
// an operator at a machine — and the desktop app then reuses the session
// instead of spending another code.
//
// This route blocks for the length of a full login: the code poll alone runs up
// to 90s, and the runner serialises Tata CliQ logins so one may wait behind
// another. Next's fetch has no default timeout, so the request rides until the
// BE's own 240s ceiling answers; `maxDuration` keeps the serverless runtime
// from cutting it short first.

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

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/tatacliq/renew-session`, {
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
