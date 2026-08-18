// Xbees Client Portal login (Keycloak SSO).
// Ported from Automated-scripts/src/scripts/xbeesAutoMation/xbeesAutoClaim/utils.js.
//
// Landing "Sign in" → Keycloak (#username / #password / #kc-login) → back to
// the portal. The bounce handler is carried over: the SSO round-trip sometimes
// returns to the landing page with a fresh "Sign in" button, and clicking
// through it is the documented behaviour, not a workaround.

const { sleep, typeInto } = require('./common')

const HOME_URL = 'https://clientportal.xbees.in/'

const clickSignIn = page =>
  page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      b => b.offsetParent !== null && (b.textContent || '').trim().toLowerCase() === 'sign in'
    )

    if (btn) {
      btn.click()

      return true
    }

    return false
  })

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Xbees: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000)

  await clickSignIn(page)

  await page.waitForSelector('#username', { visible: true, timeout: 30000 })
  await sleep(1000)

  await typeInto(page, '#username', username, { delay: 90 })
  await typeInto(page, '#password', password, { delay: 90 })
  await sleep(400)

  await page.click('#kc-login')

  // Wait to land back on the portal host.
  await page
    .waitForFunction(() => window.location.href.includes('clientportal.xbees.in'), { timeout: 30000 })
    .catch(() => console.log('   ↪ never returned to the portal host; check the window'))
  await sleep(3000)

  // Bounce handler — up to 3 passes through the landing page.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const bounced = await clickSignIn(page)

    if (!bounced) break

    console.log(`   ↪ landed on "Sign in" again (pass ${attempt}) — clicking through`)
    await sleep(4000)
  }

  return { method: 'form' }
}

module.exports = { key: 'xbees', label: 'Xbees', homeUrl: HOME_URL, login }
