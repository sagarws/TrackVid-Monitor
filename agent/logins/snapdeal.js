// Snapdeal Seller Portal login.
// Ported from Automated-scripts/src/scripts/snapdealAutoMation/snapdealAutoClaim/utils.js
// (snapdealLogin).
//
// The homepage "Login" is a text-matched element rather than an id, so it is
// clicked through the DOM scan in clickByText; the form itself lives on
// setu.snapdeal.com and is addressed by placeholder, which is what the
// automation does too.
//
// The form is THREE steps, not two — this is the part that silently stalls if
// it is collapsed into a single fill:
//   username → "Login with Password" → password → "Submit Password"
// The password input does not exist in the DOM until "Login with Password"
// is clicked, so typing into it right after the username just times out on a
// page that looks perfectly fine to whoever is watching.

const { sleep, typeInto, clickByText } = require('./common')

const HOME_URL = 'https://seller.snapdeal.com/#/'

// Post-login shell. #nav_24 (Returns) is what the auto-claim flow waits for,
// #nav_26 (Reports) what the master-data flow uses — either proves we are in.
const NAV_SELECTOR = '#nav_24 a, #nav_26 a'
const OTP_SELECTOR = '#verify-otp #otp, #otp'

const USERNAME_SELECTOR = 'input[placeholder="Enter your username"]'

// Placeholder first, type=password as the fallback — Snapdeal has reworded
// this one before ("Enter your password" / "Please enter password").
const PASSWORD_SELECTOR = 'input[placeholder="Please enter password"], input[placeholder="Enter your password"], input[type="password"]'

// Race the seller-portal shell against the OTP screen. Some accounts skip the
// OTP entirely, so waiting on only one of the two always times out for half
// the accounts.
const raceLoginOutcome = (page, timeout) =>
  Promise.any([
    page.waitForSelector(NAV_SELECTOR, { visible: true, timeout }).then(() => 'nav'),
    page.waitForSelector(OTP_SELECTOR, { visible: true, timeout }).then(() => 'otp')
  ])

// The login form still being on screen after we have waited 30s+ is Snapdeal's
// invalid-credentials signal — it renders no reliable error element.
const stillOnLoginForm = async page =>
  (await page.$('input[placeholder="Please enter password"]')) !== null ||
  (await page.$('input[placeholder="Enter your password"]')) !== null ||
  (await page.$(USERNAME_SELECTOR)) !== null

const scrapeLoginError = page =>
  page
    .evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('.error, .error-message, [class*="error"], .toast, .alert')
      )

      for (const el of candidates) {
        const text = (el.textContent || '').trim()
        if (text) return text.slice(0, 200)
      }

      return ''
    })
    .catch(() => '')

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Snapdeal: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Homepage → setu.snapdeal.com/login.
  await clickByText(page, 'Login')
  await sleep(3000)

  // Step 1 — username.
  await typeInto(page, USERNAME_SELECTOR, username, { delay: 80, timeout: 20000 })
  await sleep(800)

  // Step 2 — reveal the password field. Without this the flow stops here with
  // the username typed and nothing else happening.
  const revealed =
    (await clickByText(page, 'Login with Password', { tags: 'a,button,div,span', exact: false })) ||
    (await clickByText(page, 'Login With Password', { tags: 'a,button,div,span', exact: false }))

  if (!revealed) {
    // Older markup submitted the username with Enter instead.
    await page.keyboard.press('Enter')
  }

  await sleep(3000)

  // Step 3 — password.
  await typeInto(page, PASSWORD_SELECTOR, password, { delay: 80, timeout: 20000 })
  await sleep(800)

  const submitted = await clickByText(page, 'Submit Password', { tags: 'a,button,div,span', exact: false })

  if (!submitted) await page.keyboard.press('Enter')

  await sleep(5000)

  // URL sniffing gives false negatives here: Snapdeal lands on
  // https://seller.snapdeal.com/ and routes the dashboard via an Angular hash,
  // so wait for rendered content instead.
  let outcome

  try {
    outcome = await raceLoginOutcome(page, 15000)
  } catch (_) {
    // Sometimes stuck mid-redirect — one reload before calling it dead.
    console.log('   ↪ no post-login content yet — reloading once and waiting 15s')
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await sleep(15000)

    try {
      outcome = await raceLoginOutcome(page, 15000)
    } catch (__) {
      if (await stillOnLoginForm(page)) {
        const errorText = await scrapeLoginError(page)

        throw new Error(`Snapdeal rejected the login (form still visible). ${errorText}`.trim())
      }

      throw new Error('Snapdeal: seller portal did not render after login (even after a reload)')
    }
  }

  // The automation throws on OTP because nothing downstream can proceed. Here
  // a human is sitting in front of the window, so the challenge is reported
  // and the browser handed over — same treatment as Flipkart's OTP modal.
  if (outcome === 'otp') {
    console.log('   ↪ Snapdeal is asking for an OTP — enter it in the window')

    return { method: 'form', awaiting: 'otp' }
  }

  return { method: 'form' }
}

module.exports = { key: 'snapdeal', label: 'Snapdeal', homeUrl: HOME_URL, login }
