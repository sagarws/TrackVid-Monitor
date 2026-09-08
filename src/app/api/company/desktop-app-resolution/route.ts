// Proxy for the company detail page's Desktop-App Resolution card.
//
// GET  ?companyId=<id>
//   → BE GET /system-admin/setting/companies/desktop-app-resolution
// POST { companyId, asPerCamera, resolution? }
//   → BE POST /system-admin/setting/companies/desktop-app-resolution
//
// Byte-for-byte pattern from the multi-step-recording route — same auth
// (SystemAdmin token from NextAuth session, never reaches the browser),
// same envelope, single file for both methods.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/system-admin/setting/companies/desktop-app-resolution`
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

  const companyId = new URL(req.url).searchParams.get('companyId') ?? ''

  const res = await fetch(`${url}?companyId=${encodeURIComponent(companyId)}`, {
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
