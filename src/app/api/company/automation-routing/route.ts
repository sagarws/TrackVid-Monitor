// Proxy for the Automation Routing card (one company) and the Bulk Management
// screen (many companies).
//
// GET  ?companyId=<id>  → that company's stored maps
// GET  (no companyId)   → the cross-company summary the bulk screen renders
//                         from: totalCompanies, enabledCounts, platformAutomations
//                       → BE GET /system-admin/setting/companies/automation-routing
// POST { companyIds? | excludeCompanyIds?, desktopExecution?, apiBasedAutomation?,
//        isAutoLoginOnActiveSession? }
//                       → BE POST /system-admin/setting/companies/automation-routing
//
// `companyIds` is "for only these"; `excludeCompanyIds` is "everything but
// these". The BE resolves the scope — an "all but these" list resolved in the
// browser would be built from a roster that may already be stale.
//
// The SystemAdmin token is read from the NextAuth session so it never reaches
// the browser. Kept in one route file (two methods) instead of two files —
// the read and write share the exact same auth + upstream base URL.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/system-admin/setting/companies/automation-routing`
}

const notSignedIn = () =>
  NextResponse.json(
    { isSuccess: false, message: 'Not signed in', displayMessage: 'Session expired — please sign in again.' },
    { status: 401 }
  )

const notConfigured = () =>
  NextResponse.json({ isSuccess: false, message: 'TRACKVID_API_URL not configured' }, { status: 500 })

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) return notSignedIn()

  const url = upstream()

  if (!url) return notConfigured()

  const companyId = new URL(req.url).searchParams.get('companyId')?.trim() ?? ''

  // Omitted entirely rather than sent empty: no companyId is what asks the BE
  // for the cross-company summary, and that should read as a deliberate call.
  const target = companyId ? `${url}?companyId=${encodeURIComponent(companyId)}` : url

  const res = await fetch(target, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  })

  const json = await res.json().catch(() => null)

  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}

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

  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}
