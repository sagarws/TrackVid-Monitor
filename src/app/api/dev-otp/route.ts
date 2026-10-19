// Next Imports
import { NextResponse } from 'next/server'

// Util Imports
import { generateTotp } from '@/utils/totp'

// Dev-only helper: returns the current authenticator code for LOGIN_SECRETE so the
// login screen can skip typing it. Never available in production builds.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const secret = process.env.LOGIN_SECRETE

  if (!secret) {
    return NextResponse.json({ message: 'LOGIN_SECRETE is not configured' }, { status: 500 })
  }

  try {
    return NextResponse.json(generateTotp(secret), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || 'Failed to generate code' }, { status: 500 })
  }
}
