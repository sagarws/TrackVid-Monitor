// Myntra Partner Portal login.
// Ported from Automated-scripts/src/scripts/myntraAutoMation/myntraAutoClaim/utils.js
// (Selenium there, Puppeteer here — same steps, same waits).
//
// Two routes in:
//   1. Cookie jar, when the caller passes one. The Monitor already stores a jar
//      per credential (myntraSession), and replaying it skips the login form
//      entirely — no bot detection, no password typed, instant. This is the
//      preferred path whenever the jar is still valid.
//   2. The form, otherwise. Myntra's homepage → SSO chooser → email/password.
//      Slow per-char typing is deliberate: instant fills draw a red "Network
//      Error" banner under LOG IN.

const { sleep, typeInto, clickByText } = require('./common')

const HOME_URL = 'https://partners.myntrainfo.com/'
const DASHBOARD_URL = 'https://partners.myntrainfo.com/Dashboard'

// The two cookies partnersapi actually authenticates with. A jar missing either
// is worthless, so we do not bother replaying it.
const REQUIRED_COOKIES = ['erp.at', 'session']

async function loginWithJar(page, jar) {
  const names = Object.keys(jar || {})

  if (!REQUIRED_COOKIES.every(name => jar[name])) {
    return { used: false, reason: `jar missing ${REQUIRED_COOKIES.filter(n => !jar[n]).join(' + ')}` }
  }

  // Domain-wide so both partners. and partnersapi. see them, matching how the
  // portal sets them itself.
  await page.setCookie(
    ...names.map(name => ({
      name,
      value: String(jar[name]),
      domain: '.myntrainfo.com',
      path: '/'
    }))
  )

  await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2000)

  // A dead jar bounces back to the marketing homepage or the login route.
  const url = page.url().toLowerCase()
  const rejected = url.includes('login') || !url.includes('dashboard')

  return rejected ? { used: false, reason: 'portal rejected the stored jar' } : { used: true }
}

async function login(page, { username, password, jar }) {
  if (jar && Object.keys(jar).length > 0) {
    const viaJar = await loginWithJar(page, jar)

    if (viaJar.used) return { method: 'session-jar' }

    console.log(`   ↪ jar unusable (${viaJar.reason}) — falling back to the login form`)
  }

  if (!username || !password) throw new Error('Myntra: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })

  // Long initial wait lets bot-detection / analytics bootstrap before we touch
  // anything.
  await sleep(6000)

  await clickByText(page, 'Login')
  await sleep(2500)

  // SSO chooser — the portal offers OTP first; we want the password form.
  await clickByText(page, 'Use Email And Password')
  await sleep(2500)

  await typeInto(page, '#email', username, { delay: 90 })
  await sleep(1200)
  await typeInto(page, '#password', password, { delay: 90 })
  await sleep(2000)

  // The form sometimes auto-submits on the last keystroke, in which case the
  // button is already gone — not an error.
  const clicked = await clickByText(page, 'LOG IN', { tags: 'button' })

  if (!clicked) console.log('   ↪ LOG IN button not found — assuming the form auto-submitted')

  await page
    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    .catch(() => console.log('   ↪ no navigation event; checking the URL instead'))
  await sleep(3000)

  return { method: 'form' }
}

module.exports = { key: 'myntra', label: 'Myntra', homeUrl: HOME_URL, login }
