// Proxy for the mail fetch folder controls — the company list's "Fetch from"
// picker and the Bulk Management "Email Automation" card.
//
// GET  ?companyId=<id>  → that company's folder + the accepted options
// GET  (no companyId)   → { totalCompanies, counts } for the bulk card's counter
//                       → BE GET /system-admin/setting/companies/mail-fetch-folder
// POST { mailFetchFolder, companyIds? | excludeCompanyIds? }
//                       → BE POST /system-admin/setting/companies/mail-fetch-folder
//
// Same shape as the cms-terms-agreed proxy next door, including reading the
// SystemAdmin token off the NextAuth session so it never reaches the browser.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/system-admin/setting/companies/mail-fetch-folder`
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
