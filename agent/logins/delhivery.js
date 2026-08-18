// Delhivery One login.
// Ported from Automated-scripts/src/scripts/delhiveryAutoMation/delhiveryAutoClaim/utils.js.
//
// Email → Continue → (separate Keycloak password page) → Login. The quirk
// carried over: Keycloak renders extra HIDDEN password inputs and Login buttons
// for browser autofill, so a plain `input[type=password]` selector finds a 0x0
// node first. Both steps below pick the visible element explicitly.

const { sleep, typeInto } = require('./common')

const HOME_URL = 'https://one.delhivery.com/'

// Returns a selector-free handle to the first element matching `selector` that
// actually has layout. Puppeteer's `visible: true` covers most of this, but
// Keycloak's decoys are display:block with zero size, which it accepts.
async function firstVisible(page, selector, timeout = 20000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const handles = await page.$$(selector)

    for (const handle of handles) {
      const box = await handle.boundingBox()

      if (box && box.width > 0 && box.height > 0) return handle
    }

    await sleep(400)
  }

  throw new Error(`Delhivery: no visible element for ${selector} within ${timeout}ms`)
}

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Delhivery: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000)

  await typeInto(page, 'input[name="email"][type="email"]', username, { delay: 90 })
  await sleep(700)

  const preContinueUrl = page.url()

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      b => (b.textContent || '').trim().toLowerCase() === 'continue'
    )

    if (btn) btn.click()
  })

  // Delhivery navigates to a dedicated password page; either the URL moves or
  // a password field appears in place.
  await page
    .waitForFunction(
      previous => window.location.href !== previous || !!document.querySelector('input[type="password"]'),
      { timeout: 20000 },
      preContinueUrl
    )
    .catch(() => console.log('   ↪ no password page detected; check the window'))
  await sleep(1500)

  const passwordEl = await firstVisible(page, 'input[type="password"]')

  await passwordEl.click()
  await passwordEl.type(String(password), { delay: 120 })
  await sleep(700)

  const loginBtn = await firstVisible(page, 'button')

  // Pick the visible button that actually says Login, not merely the first one.
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => {
      const rect = b.getBoundingClientRect()

      return rect.width > 0 && rect.height > 0 && (b.textContent || '').trim().toLowerCase() === 'login'
    })

    if (btn) {
      btn.click()

      return true
    }

    return false
  })

  if (!clicked) await loginBtn.click()

  await page
    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    .catch(() => console.log('   ↪ no navigation event; check the window'))
  await sleep(3000)

  return { method: 'form' }
}

module.exports = { key: 'delhivery', label: 'Delhivery', homeUrl: HOME_URL, login }
