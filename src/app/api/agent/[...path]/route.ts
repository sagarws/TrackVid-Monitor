// Same-origin passthrough to the local browser agent (see agent/ in this repo),
// so the Monitor page talks to :4001 like everything else instead of reaching
// across to :7788. That removes the CORS allowlist and Chrome's Private Network
// Access preflight from the picture entirely.
//
// IMPORTANT: this forwards from the NEXT SERVER, so it only reaches the right
// machine when the Monitor runs where the operator sits — which is the case for
// `pnpm dev`, and is the whole premise of a local agent. If the Monitor is ever
// deployed to a shared host, point the browser straight at each operator's own
// agent with NEXT_PUBLIC_LOCAL_AGENT_URL instead; the client falls back to
// calling that URL directly and this route stops being used.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'

const AGENT_URL = process.env.LOCAL_AGENT_URL || 'http://127.0.0.1:7788'

// Login can take up to a minute on the slower portals.
const OPEN_TIMEOUT_MS = 120_000

// The health probe fires on every page load, so it must fail fast rather than
// leave the button on "checking" for two minutes when nothing is listening.
const HEALTH_TIMEOUT_MS = 2_000

const forward = async (req: Request, path: string[], method: 'GET' | 'POST') => {
  // Gated like every other Monitor route: the agent holds credentials, and an
  // unauthenticated caller must not be able to drive it through this proxy.
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  }

  const target = `${AGENT_URL.replace(/\/$/, '')}/${path.join('/')}`
  const isHealth = path[0] === 'health'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), isHealth ? HEALTH_TIMEOUT_MS : OPEN_TIMEOUT_MS)

  try {
    const res = await fetch(target, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'POST' ? await req.text() : undefined,
      signal: controller.signal,
      cache: 'no-store'
    })

    const json = await res.json().catch(() => null)

    return NextResponse.json(json ?? { ok: false, error: 'Empty response from the agent' }, { status: res.status })
  } catch (err: any) {
    // Nothing listening is the normal case when the agent was not started, so
    // it is reported as a plain 503 with the fix rather than a 500.
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.name === 'AbortError'
            ? 'The local agent did not answer in time'
            : `Local agent unreachable at ${AGENT_URL}`,
        hint: 'Start it with "cd agent && npm install", then "pnpm dev"'
      },
      { status: 503 }
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params

  return forward(req, path, 'GET')
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params

  return forward(req, path, 'POST')
}
