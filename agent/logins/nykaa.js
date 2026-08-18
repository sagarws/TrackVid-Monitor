// Nykaa dispute portal login (Zoho Desk).
// Ported from Automated-scripts/src/scripts/nykaaAutoClaim/utils.js.
//
// The portal is Zoho-hosted and the login inputs live INSIDE an iframe
// (#iamFrame), so every field interaction below goes through the frame handle
// rather than the page. Two steps, same button: email → Next → password → Sign
// in (#nextbtn is relabelled between them).
//
// Zoho challenges with captcha / OTP / MFA more often than the other portals.
// That is exactly the case this agent handles better than the automation — a
// human is sitting in front of the window and can just answer it — so an
// unfinished login here is left on screen rather than treated as fatal.

const { sleep } = require('./common')

const HOME_URL = 'https://dispute.nykaa.com/portal/en/signin'

async function loginFrame(page, timeout = 20000) {
  const handle = await page.waitForSelector('#iamFrame', { visible: true, timeout })
  const frame = await handle.contentFrame()

  if (!frame) throw new Error('Nykaa: could not access the #iamFrame content frame')

  await frame.waitForSelector('#login_id', { visible: true, timeout })

  return frame
}

async function login(page, { username, password }) {
  if (!username || !password) throw new Error('Nykaa: username and password are required')

  await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500)

  // An existing profile session lands on the portal instead of the sign-in
  // page, where there is no iframe at all — waiting for one would burn 20s.
  const alreadyIn = await page.$('#iamFrame')

  if (!alreadyIn) {
    console.log('   ↪ no sign-in frame — already authenticated')

    return { method: 'existing-session' }
  }

  const frame = await loginFrame(page)

  await frame.click('#login_id', { clickCount: 3 })
  await frame.type('#login_id', username, { delay: 80 })
  await frame.click('#nextbtn')

  await frame.waitForSelector('#password', { visible: true, timeout: 15000 })
  await sleep(800)

  await frame.click('#password', { clickCount: 3 })
  await frame.type('#password', password, { delay: 80 })
  await frame.click('#nextbtn')

  await sleep(6000)

  return { method: 'form' }
}

module.exports = { key: 'nykaa', label: 'Nykaa', homeUrl: HOME_URL, login }
