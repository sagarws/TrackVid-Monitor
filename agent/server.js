// -----------------------------------------------------------------------------
// TrackVid Monitor — local browser agent
// -----------------------------------------------------------------------------
// Opens a logged-in marketplace browser ON THE OPERATOR'S OWN MACHINE, so a
// system-admin can click "Open Account" in the Monitor and land in a working
// seller portal without typing credentials.
//
// Why an agent at all: a web page cannot launch a browser. Automated-scripts
// can, but it runs on the automation server, so its Chrome window appears
// there — useless to a human sitting somewhere else. This process runs where
// the human is.
//
// Run it:  cd agent && npm install && npm start      (or: pnpm agent from root)
// Listens: 127.0.0.1:7788 — loopback only, never exposed to the network.
//
// Lifecycle: after login the agent calls browser.disconnect(), which leaves
// Chrome running and untethered. Signal handlers are disabled at launch so
// stopping the agent does NOT kill windows the operator is working in.
//
// Credentials arrive in the request body from the Monitor page, which already
// renders them in the credential panel; this adds no exposure beyond that
// panel. Nothing is written to disk except Chrome's own profile.
// -----------------------------------------------------------------------------

// Loads GMAIL_IMAP_USER / GMAIL_IMAP_PASSWORD when present, for Flipkart's OTP
// auto-fill. Absent is fine — that path degrades to "type the code by hand".
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const os = require('os')
const path = require('path')
const puppeteer = require('puppeteer')

const { getPlatform, supportedPlatforms } = require('./logins')

const PORT = Number(process.env.AGENT_PORT || 7788)

// Only the Monitor may talk to this agent. Any origin can be added for a
// deployed Monitor, but the default keeps it to local dev.
const ALLOWED_ORIGINS = (process.env.AGENT_ALLOWED_ORIGINS || 'http://localhost:4001,http://127.0.0.1:4001')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

// One Chrome profile per platform+account, kept between opens: the second open
// of the same account usually finds it still signed in, and the login flow
// short-circuits. Also keeps two accounts on the same marketplace from
// clobbering each other's session.
const PROFILE_ROOT = process.env.AGENT_PROFILE_DIR || path.join(os.tmpdir(), 'trackvid-monitor-profiles')

const profileDirFor = (platform, username) =>
  path.join(PROFILE_ROOT, `${platform}-${String(username).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`)

const app = express()

app.use(express.json({ limit: '256kb' }))
app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = curl/Postman, which is fine for a loopback tool.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true)

      return callback(new Error(`Origin not allowed: ${origin}`))
    }
  })
)

// Chrome's Private Network Access check: an https:// Monitor calling
// http://127.0.0.1 sends a preflight expecting this header, and refuses the
// request without it.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }

  next()
})

// The Monitor pings this to decide whether to enable the Open Account button.
app.get('/health', (_req, res) => {
  res.json({ ok: true, agent: 'trackvid-monitor-agent', platforms: supportedPlatforms() })
})

app.post('/open', async (req, res) => {
  const { platform, username, password, jar } = req.body || {}

  const target = getPlatform(platform)

  if (!target) {
    return res.status(400).json({
      ok: false,
      error: `Unsupported platform "${platform}". Supported: ${supportedPlatforms()
        .map(p => p.key)
        .join(', ')}`
    })
  }

  if (!username) {
    return res.status(400).json({ ok: false, error: 'username is required' })
  }

  const startedAt = Date.now()
  let browser

  console.log(`\n🚀 [open] ${target.label} as ${username}`)

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: profileDirFor(target.key, username),
      // Prefer the operator's real Chrome so they get their own extensions and
      // it looks like the browser they already use. Falls back to the bundled
      // Chromium when Chrome is not installed.
      channel: process.env.AGENT_CHROME_CHANNEL || 'chrome',
      // The whole point: the browser must outlive this process. Without these,
      // stopping the agent (or Ctrl-C) closes every window the operator opened.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    })

    const [page] = await browser.pages()

    const result = await target.login(page, { username, password, jar })

    const elapsedMs = Date.now() - startedAt
    const url = page.url()

    if (result.awaiting) {
      console.log(`⏸  [open] ${target.label} / ${username} is waiting on ${result.awaiting} — window left open`)
    } else {
      console.log(`✅ [open] ${target.label} / ${username} ready in ${elapsedMs}ms via ${result.method} → ${url}`)
    }

    // Hand the browser over. disconnect() drops the DevTools connection without
    // terminating Chrome, so the operator keeps a normal window.
    browser.disconnect()

    return res.json({
      ok: true,
      platform: target.key,
      username,
      method: result.method,
      // 'otp' when the portal challenged and no code could be filled — the
      // window is open and logged-in-pending, which is not the same as done.
      awaiting: result.awaiting ?? null,
      url,
      elapsedMs
    })
  } catch (err) {
    const elapsedMs = Date.now() - startedAt

    console.error(`🚨 [open] ${target.label} / ${username} failed after ${elapsedMs}ms: ${err.message}`)

    // Leave the window open even on failure: the operator can finish the login
    // by hand (OTP, captcha, a changed form) instead of starting over. Closing
    // it here would throw away the useful half of the work.
    if (browser) {
      try {
        browser.disconnect()
      } catch (_) {
        /* already gone */
      }
    }

    return res.status(500).json({
      ok: false,
      platform: target.key,
      username,
      error: err.message,
      hint: 'The browser was left open — finish the login by hand if the portal changed its form.',
      elapsedMs
    })
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log('─'.repeat(72))
  console.log('TrackVid Monitor — local browser agent')
  console.log(`Listening on   http://127.0.0.1:${PORT}`)
  console.log(`Allowed origin ${ALLOWED_ORIGINS.join(', ')}`)
  console.log(`Profiles in    ${PROFILE_ROOT}`)
  console.log(`Platforms      ${supportedPlatforms().map(p => p.key).join(', ')}`)
  console.log('─'.repeat(72))
})
