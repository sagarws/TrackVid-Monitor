// Server-side proxy from the Monitor to TrackVid-BE. Reads the SystemAdmin
// access token from the NextAuth session (kept out of the browser) and
// forwards the { companyIds, platforms } body to
// POST {TRACKVID_API_URL}/system-admin/trigger-master-sync.

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
    return NextResponse.json(
      { isSuccess: false, message: 'TRACKVID_API_URL not configured' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/system-admin/trigger-master-sync`, {
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
