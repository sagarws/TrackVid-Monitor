// Proxy for the Manual Step-Merge trigger button on the Multi-Step
// Recording card. Mirrors the read/write pattern in
// api/company/multi-step-recording/route.ts one-for-one — same auth,
// same upstream host, same envelope shape.
//
// POST { companyId, awb }
//   → BE POST /system-admin/setting/companies/step-merge/trigger
//
// Body payload:
//   companyId - required, taken from the company detail page URL
//   awb       - required, may be a step AWB ("7698421288_S3") or a
//               base AWB ("7698421288"); the BE controller strips
//               the _S{n} suffix.
//
// Response is the raw BE envelope: { isSuccess, message, displayMessage, data }.
// The card renders `displayMessage` for both success and error paths so
// the operator sees a human-readable summary.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/system-admin/setting/companies/step-merge/trigger`
}

const notSignedIn = () =>
  NextResponse.json(
    { isSuccess: false, message: 'Not signed in', displayMessage: 'Session expired — please sign in again.' },
    { status: 401 }
  )

const notConfigured = () =>
  NextResponse.json({ isSuccess: false, message: 'TRACKVID_API_URL not configured' }, { status: 500 })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) return notSignedIn()

  const url = upstream()

  if (!url) return notConfigured()

  const body = await req.json().catch(() => ({}))

  const res = await fetch(url, {
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

  return NextResponse.json(
    json ?? { isSuccess: false, message: 'Empty response from server' },
    { status: res.status }
  )
}
