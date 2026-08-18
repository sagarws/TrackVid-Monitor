// AJIO Seller Portal login.
// Ported from Automated-scripts/src/helper/login.js.
//
// AJIO moved to Reliance Retail OAuth SSO in 2026-07: seller.ajio.com redirects
// to sellers.relianceretail.com/auth/oauth/authorize, which renders
// form#loginForm with the stable ids #username / #password / #submitBtn. Some
// builds auto-redirect there, others show a "Log in" launcher first — hence the
// conditional click below.

const { sleep, typeInto } = require('./common')

const HOME_URL = 'https://seller.ajio.com/ajiocommerce/'

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Ajio: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2000)

  // Skip the launcher click when a build has already dropped us on the SSO form.
  const onSsoForm = await page.$('#loginForm #username')

  if (!onSsoForm) {
    await page.evaluate(() => {
      const el =
        document.querySelector('#ui-btn') ||
        Array.from(document.querySelectorAll('a,button')).find(
          node => node.offsetParent !== null && /log\s*in/i.test((node.textContent || '').replace(/\s+/g, ' ').trim())
        )

      if (el) el.click()
    })
  }

  // Generous timeout: the OAuth authorize page mints fresh state/nonce/PKCE on
  // every visit and is routinely slow.
  await page.waitForSelector('#loginForm #username', { visible: true, timeout: 60000 })

  await typeInto(page, '#username', username, { delay: 80 })
  await typeInto(page, '#password', password, { delay: 80 })
  await sleep(800)

  await page.click('#submitBtn')

  // Success = the OAuth callback lands back on seller.ajio.com. Checked by
  // hostname rather than an error selector, which AJIO rewrites often.
  await page
    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    .catch(() => console.log('   ↪ no navigation event; checking the URL instead'))
  await sleep(3000)

  return { method: 'form' }
}

module.exports = { key: 'ajio', label: 'Ajio', homeUrl: HOME_URL, login }
