// Proxy for "Process Claim" on the Pending CMS report. Forwards { ids } — CMS
// claim ids that may span several companies — to
// POST {TRACKVID_API_URL}/system-admin/cms/run-return-script, which resolves
// each row's company + credentials and dispatches one auto-claim job per
// company. The SystemAdmin token is read from the NextAuth session so it never
// reaches the browser.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

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

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/cms/run-return-script`, {
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
