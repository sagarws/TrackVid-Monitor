// Flipkart Seller Hub login.
// Ported from Automated-scripts/src/scripts/flipkartAutoMation/flipkartAutoClaim/utils.js
// (Selenium there, Puppeteer here).
//
// Two-step modal: username → Next → password → Login. Two quirks carried over
// verbatim because both are load-bearing:
//   1. Flipkart's edge sometimes serves an nginx "502 Bad Gateway" on cold
//      navigation, where the landing Login button simply does not exist.
//      Reload a few times before giving up.
//   2. The modal transitions username→password via a React re-render, so a
//      field located too early detaches mid-typing. Wait for it to be visible
//      and settle before typing.

const { sleep, typeInto, clickByText } = require('./common')

const HOME_URL = 'https://seller.flipkart.com/'

const isBadGateway = page =>
  page.evaluate(() => {
    const h1 = document.querySelector('h1')

    return /502\s*Bad\s*Gateway/i.test(document.title || '') || /502\s*Bad\s*Gateway/i.test((h1 && h1.textContent) || '')
  })

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Flipkart: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })

  // Slow start is a strong human signal — bot detection bootstraps in this window.
  await sleep(7000)

  const MAX_RELOADS = 4

  for (let attempt = 1; attempt <= MAX_RELOADS && (await isBadGateway(page)); attempt++) {
    console.log(`   ↪ Flipkart edge served 502 (attempt ${attempt}/${MAX_RELOADS}) — reloading`)
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {})
    await sleep(5000)

    if (attempt === MAX_RELOADS && (await isBadGateway(page))) {
      throw new Error('Flipkart: edge served 502 Bad Gateway on every reload attempt')
    }
  }

  await clickByText(page, 'Login', { tags: 'button' })

  await typeInto(page, 'input[name="username"]', username, { delay: 90 })
  await sleep(1200)

  // Next stays disabled until the field validates.
  await page.waitForFunction(
    () => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        /^next$/i.test((b.textContent || '').trim())
      )

      return btn && !btn.disabled
    },
    { timeout: 15000 }
  )
  await clickByText(page, 'Next', { tags: 'button' })

  // Let the username→password re-render finish before touching the field.
  await sleep(2500)
  await typeInto(page, 'input[name="password"]', password, { delay: 90, timeout: 30000 })
  await sleep(1000)

  await clickByText(page, 'Login', { tags: 'button' })

  await page
    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    .catch(() => console.log('   ↪ no navigation event; check the window'))
  await sleep(3000)

  return { method: 'form' }
}

module.exports = { key: 'flipkart', label: 'Flipkart', homeUrl: HOME_URL, login }
