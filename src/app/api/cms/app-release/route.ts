// Proxy for the CMS Desktop App Version page.
//
// GET → BE GET /cms/app-release
// PUT → BE PUT /cms/app-release   { versionName, isForceFullyUpdate, link }
//
// Same pattern as the company cards' proxies: the SystemAdmin token comes off
// the NextAuth session server-side and never reaches the browser.
//
// NOT UNDER /system-admin, unlike every other route in this folder. The pair
// lives on the CMS router (BE mounts `/api` → `/cms`), because it shares an
// object with the PUBLIC `/cms/version` the desktop app polls on launch. Only
// the read is public; both routes here sit behind `systemAdminAuth`.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/cms/app-release`
}

const notSignedIn = () =>
  NextResponse.json(
    { isSuccess: false, message: 'Not signed in', displayMessage: 'Session expired — please sign in again.' },
    { status: 401 }
  )

const notConfigured = () =>
  NextResponse.json({ isSuccess: false, message: 'TRACKVID_API_URL not configured' }, { status: 500 })

export async function GET() {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) return notSignedIn()

  const url = upstream()

  if (!url) return notConfigured()

  const res = await fetch(url, {
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

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) return notSignedIn()

  const url = upstream()

  if (!url) return notConfigured()

  const body = await req.json().catch(() => ({}))

  const res = await fetch(url, {
    method: 'PUT',
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
