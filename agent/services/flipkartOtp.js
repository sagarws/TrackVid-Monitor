// Flipkart Seller OTP lookup — ported from
// Automated-scripts/services/GetFlipKartOTP.js.
//
// Flipkart mails a 6-digit code from noreply@rmo.flipkart.com. The body reads
// "Your OTP: 896845", so the regex anchors on that phrase rather than matching
// any digit run in the footer boilerplate.
//
// `since` is a cutoff captured just before the login click: without it a stale
// code from an earlier session gets picked up and typed into a modal that will
// reject it.

const { fetchLatestEmail, isConfigured } = require('./gmailReader')

const SENDER = 'noreply@rmo.flipkart.com'
const SUBJECT = 'is your verification code for secure access'
const OTP_REGEX = /Your OTP:\s*(\d{4,8})/i

async function getFlipkartOtp(to, { since } = {}) {
  if (!to) throw new Error('getFlipkartOtp: missing recipient address')

  const message = await fetchLatestEmail({ from: SENDER, to, subject: SUBJECT, since })

  if (!message) return null

  const match = `${message.text}\n${message.html}`.match(OTP_REGEX)

  return match ? match[1] : null
}

// Polls until a fresh code lands. Flipkart dispatches the mail a few seconds
// after the login click and Gmail's IMAP mirror lags behind that, so the first
// couple of cycles routinely find nothing.
async function pollFlipkartOtp(to, since, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  let attempt = 0

  while (Date.now() < deadline) {
    attempt++

    try {
      const otp = await getFlipkartOtp(to, { since })

      if (otp && /^\d{4,8}$/.test(otp)) return otp
    } catch (err) {
      console.log(`    ⚠️  OTP fetch attempt ${attempt} errored: ${err.message}`)
    }

    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  return null
}

module.exports = { getFlipkartOtp, pollFlipkartOtp, isConfigured }
