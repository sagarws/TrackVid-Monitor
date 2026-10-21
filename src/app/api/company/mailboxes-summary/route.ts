// Proxy for the company list page's Mailboxes column and expanded row.
// Lists the mailboxes of a page of companies via POST {TRACKVID_API_URL}/system-admin/company/mailboxes-summary. The SystemAdmin token
// is read from the NextAuth session so it never reaches the browser.

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

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/company/mailboxes-summary`, {
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

  // A 404 here means the backend predates this endpoint — say so, rather than
  // the generic "empty response" its HTML 404 page would otherwise produce.
  if (res.status === 404) {
    return NextResponse.json(
      {
        isSuccess: false,
        message: 'mailboxes-summary not found on backend',
        displayMessage: 'This backend does not have the mailbox summary endpoint yet — deploy TrackVid-BE first.'
      },
      { status: 404 }
    )
  }

  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}
