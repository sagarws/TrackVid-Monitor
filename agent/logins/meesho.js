// Meesho Supplier Portal login.
// Ported from Automated-scripts/src/scripts/meeshoAutoClaim/scriptNew.js.
//
// The simplest of the four: a real login anchor (#loginbutton) and named form
// fields. Meesho does sometimes challenge with an OTP to the registered phone —
// that is exactly the case this agent handles better than the automation, since
// a human is sitting in front of the browser and can just type it.

const { sleep, typeInto } = require('./common')

const HOME_URL = 'https://supplier.meesho.com/'

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Meesho: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })

  await page.waitForSelector('a#loginbutton', { visible: true, timeout: 30000 })
  await page.evaluate(() => document.querySelector('a#loginbutton').click())
  await sleep(3000)

  await typeInto(page, 'input[name="emailOrPhone"]', username, { delay: 50 })
  await typeInto(page, 'input[name="password"]', password, { delay: 50 })
  await sleep(500)

  await page.waitForSelector('button[type="submit"]', { visible: true, timeout: 15000 })
  await page.click('button[type="submit"]')

  await sleep(5000)

  return { method: 'form' }
}

module.exports = { key: 'meesho', label: 'Meesho', homeUrl: HOME_URL, login }
