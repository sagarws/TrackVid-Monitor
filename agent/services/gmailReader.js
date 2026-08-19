// Gmail IMAP reader — ported from Automated-scripts/gmail-reader.js, trimmed to
// the one search the agent needs (newest message matching from/to/subject since
// a cutoff).
//
// Difference from the original on purpose: that module throws at REQUIRE time
// when GMAIL_IMAP_* is unset, which would take the whole agent down. Here the
// check is deferred to the call, so an operator with no Gmail configured still
// gets every other platform — Flipkart just falls back to "type the OTP
// yourself", which is fine given a human is sitting in front of the window.

const Imap = require('imap')
const { simpleParser } = require('mailparser')

const isConfigured = () => Boolean(process.env.GMAIL_IMAP_USER && process.env.GMAIL_IMAP_PASSWORD)

const imapConfig = () => ({
  user: process.env.GMAIL_IMAP_USER,
  password: process.env.GMAIL_IMAP_PASSWORD,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  // Carried over from the automation: corporate/VPN MITM rejects the handshake
  // with DEPTH_ZERO_SELF_SIGNED_CERT. Insecure fallback until the network CA is
  // properly trusted.
  tlsOptions: { servername: 'imap.gmail.com', rejectUnauthorized: false }
})

const buildCriteria = ({ from, to, subject, since }) => {
  const criteria = []

  if (from) criteria.push(['FROM', from])
  if (to) criteria.push(['TO', to])
  if (subject) criteria.push(['SUBJECT', subject])
  if (since) criteria.push(['SINCE', since])

  return criteria.length ? criteria : ['ALL']
}

// Returns the newest matching message as { text, html }, or null.
function fetchLatestEmail(filters = {}) {
  if (!isConfigured()) {
    return Promise.reject(new Error('GMAIL_IMAP_USER / GMAIL_IMAP_PASSWORD are not set'))
  }

  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig())
    let settled = false

    const done = (err, value) => {
      if (settled) return
      settled = true
      try {
        imap.end()
      } catch (_) {
        /* already closing */
      }
      if (err) reject(err)
      else resolve(value)
    }

    imap.once('error', err => done(err))

    imap.once('ready', () => {
      imap.openBox(filters.mailbox || 'INBOX', true, err => {
        if (err) return done(err)

        imap.search(buildCriteria(filters), (searchErr, uids) => {
          if (searchErr) return done(searchErr)
          if (!uids || uids.length === 0) return done(null, null)

          // Newest first — IMAP returns ascending UIDs.
          const newest = uids[uids.length - 1]
          const fetcher = imap.fetch(newest, { bodies: '' })

          fetcher.on('message', msg => {
            msg.on('body', stream => {
              simpleParser(stream, (parseErr, parsed) => {
                if (parseErr) return done(parseErr)
                done(null, { text: parsed.text || '', html: parsed.html || '' })
              })
            })
          })

          fetcher.once('error', fetchErr => done(fetchErr))
          fetcher.once('end', () => setTimeout(() => done(null, null), 5000))
        })
      })
    })

    imap.connect()
  })
}

module.exports = { fetchLatestEmail, isConfigured }
