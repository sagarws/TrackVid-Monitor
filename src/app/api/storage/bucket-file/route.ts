// Proxy for the profile page's "Bucket File" card.
//
// POST   → BE POST   /system-admin/bucket-file   (multipart, single field `file`)
// DELETE → BE DELETE /system-admin/bucket-file   { url }
//
// Same pattern as every other route in this folder: the SystemAdmin token is
// read off the NextAuth session server-side and never reaches the browser.
//
// The POST forwards the request body as a STREAM rather than parsing it into a
// FormData first — a re-parse would hold the whole upload (up to the BE's
// 100 MB cap) in this process's heap before a single byte leaves for S3.
// Streaming needs `duplex: 'half'`, which is not in the RequestInit type yet,
// hence the cast below.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const upstream = () => {
  const base = process.env.TRACKVID_API_URL

  if (!base) return null

  return `${base.replace(/\/$/, '')}/system-admin/bucket-file`
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

  const contentType = req.headers.get('content-type')

  if (!contentType?.startsWith('multipart/form-data')) {
    return NextResponse.json(
      {
        isSuccess: false,
        message: 'Expected multipart/form-data',
        displayMessage: 'Upload must be sent as a file, not JSON.'
      },
      { status: 400 }
    )
  }

  // The multipart boundary lives in Content-Type, so it has to be forwarded
  // verbatim or busboy on the BE cannot split the parts.
  const init = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType
    },
    body: req.body,
    duplex: 'half',
    cache: 'no-store'
  } as unknown as RequestInit

  const res = await fetch(url, init)
  const json = await res.json().catch(() => null)

  return NextResponse.json(json ?? { isSuccess: false, message: 'Empty response from server' }, { status: res.status })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) return notSignedIn()

  const url = upstream()

  if (!url) return notConfigured()

  const body = await req.json().catch(() => ({}))

  const res = await fetch(url, {
    method: 'DELETE',
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
