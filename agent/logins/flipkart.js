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
const { pollFlipkartOtp, isConfigured } = require('../services/flipkartOtp')

const HOME_URL = 'https://seller.flipkart.com/'

const OTP_INPUT_CSS = 'input.otp-input'

const countOtpInputs = page => page.$$eval(OTP_INPUT_CSS, els => els.length).catch(() => 0)

// Best-effort "Resend OTP" click. Flipkart usually gates it behind a countdown,
// so a disabled control is a silent no-op rather than an error.
const tryClickResendOtp = page =>
  page
    .evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      const btn = nodes.find(
        n =>
          n.offsetParent !== null &&
          /resend/i.test((n.textContent || '').trim()) &&
          !n.disabled &&
          n.getAttribute('aria-disabled') !== 'true'
      )

      if (btn) {
        btn.click()

        return true
      }

      return false
    })
    .catch(() => false)

// Fill the six boxes, clearing each first — on a wrong-OTP retry Flipkart
// leaves the previous digits in place and a plain type() would append to them.
async function enterOtpDigits(page, otp) {
  const inputs = await page.$$(OTP_INPUT_CSS)

  if (inputs.length < 6) throw new Error('Flipkart: OTP inputs disappeared before they could be filled')

  const digits = String(otp).split('').slice(0, 6)

  for (let i = 0; i < 6; i++) {
    await inputs[i].click({ clickCount: 3 })
    await page.keyboard.press('Backspace')
    await inputs[i].type(digits[i], { delay: 60 })
    await sleep(120)
  }

  // Nudges Flipkart's auto-submit.
  await inputs[5].press('Enter').catch(() => {})
}

// Ported from Automated-scripts' handleOtpChallenge, with one deliberate
// difference: the automation THROWS when it cannot get a code, because nothing
// downstream can proceed without one. Here a human is sitting in front of the
// window, so an unresolved challenge is reported and the window handed over —
// typing six digits is not worth failing an open for.
//
// Returns 'not-challenged' | 'auto-filled' | 'awaiting-otp'.
async function handleOtpChallenge(page, { username, otpEmail }, requestedAt) {
  const deadline = Date.now() + 8000
  let boxes = 0

  while (Date.now() < deadline) {
    boxes = await countOtpInputs(page)
    if (boxes >= 6) break
    await sleep(500)
  }

  if (boxes < 6) return 'not-challenged'

  const recipient = otpEmail || username

  if (!isConfigured()) {
    console.log('   ↪ OTP modal shown, Gmail not configured (GMAIL_IMAP_USER/PASSWORD) — enter the code by hand')

    return 'awaiting-otp'
  }

  // Flipkart mails the code a few seconds after the login click and Gmail's
  // IMAP mirror lags behind that; polling immediately burns cycles finding
  // nothing, or picks up a stale code if the cutoff clock is off.
  console.log('   ↪ OTP modal detected — waiting 10s for the mail to land')
  await sleep(10000)

  const MAX_ATTEMPTS = 2
  let cutoff = requestedAt

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`   ↪ OTP attempt ${attempt}/${MAX_ATTEMPTS} — polling Gmail for ${recipient}`)

    const otp = await pollFlipkartOtp(recipient, cutoff)

    if (!otp) {
      console.log(`   ↪ no fresh OTP arrived for ${recipient} within 90s — enter it by hand`)

      return 'awaiting-otp'
    }

    // The modal can close while we poll (auto-continue, or the operator typed
    // it themselves in the open window).
    if ((await countOtpInputs(page)) === 0) return 'auto-filled'

    await enterOtpDigits(page, otp)

    // Inputs are removed from the DOM on successful verification.
    const closeDeadline = Date.now() + 15000

    while (Date.now() < closeDeadline) {
      if ((await countOtpInputs(page)) === 0) {
        console.log(`   ↪ OTP accepted (attempt ${attempt})`)

        return 'auto-filled'
      }

      await sleep(500)
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log('   ↪ modal still open after 15s — assuming wrong code, requesting a resend')
      await tryClickResendOtp(page)
      // Fresh cutoff so the rejected code is filtered out even if Resend was
      // behind a countdown and did nothing.
      cutoff = new Date()
      await sleep(10000)
    }
  }

  console.log('   ↪ OTP not accepted after retry — finish it by hand in the window')

  return 'awaiting-otp'
}

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

  // Captured BEFORE the submit: everything older than this is a stale code
  // from a previous session and must not be typed into the modal.
  const otpRequestedAt = new Date()

  await clickByText(page, 'Login', { tags: 'button' })

  await page
    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    .catch(() => console.log('   ↪ no navigation event; check the window'))
  await sleep(3000)

  const otp = await handleOtpChallenge(page, { username, otpEmail: null }, otpRequestedAt)

  return {
    method: otp === 'auto-filled' ? 'form+otp' : 'form',
    // Surfaced so the Monitor can say "Flipkart is asking for an OTP" instead
    // of reporting a bare success on a window that is not logged in yet.
    awaiting: otp === 'awaiting-otp' ? 'otp' : null
  }
}

module.exports = { key: 'flipkart', label: 'Flipkart', homeUrl: HOME_URL, login }
