// Snapdeal Seller Portal login.
// Ported from Automated-scripts/src/scripts/snapdealAutoMation/snapdealAutoClaim/utils.js.
//
// The homepage "Login" is a text-matched element rather than an id, so it is
// clicked through the DOM scan in clickByText; the form itself is addressed by
// placeholder, which is what the automation does too.

const { sleep, typeInto, clickByText } = require('./common')

const HOME_URL = 'https://seller.snapdeal.com/#/'

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Snapdeal: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  await clickByText(page, 'Login')
  await sleep(3000)

  await typeInto(page, 'input[placeholder="Enter your username"]', username, { delay: 60, timeout: 15000 })
  await typeInto(page, 'input[placeholder="Enter your password"]', password, { delay: 60, timeout: 15000 })
  await sleep(500)

  // Submit by text — the button carries no stable id or type=submit.
  const clicked = (await clickByText(page, 'Login', { tags: 'button' })) || (await clickByText(page, 'LOGIN', { tags: 'button' }))

  if (!clicked) await page.keyboard.press('Enter')

  await sleep(5000)

  return { method: 'form' }
}

module.exports = { key: 'snapdeal', label: 'Snapdeal', homeUrl: HOME_URL, login }
