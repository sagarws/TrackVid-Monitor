// Shared helpers for the per-platform login flows. Ported from
// Automated-scripts (src/helper/login.js, src/scripts/*/utils.js) and trimmed
// to the login step only — this agent hands the browser to a human, so
// everything the automation does after login is deliberately absent.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Type into a field the way the automation does: clear first, then per-char
// with a delay. The delay is not cosmetic — Myntra and Ajio both surface bot
// heuristics against instant fills.
async function typeInto(page, selector, value, { delay = 60, timeout = 30000 } = {}) {
  await page.waitForSelector(selector, { visible: true, timeout })
  const field = await page.$(selector)

  await field.click({ clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value, { delay })
}

// Click the first visible element whose trimmed text matches. Used where the
// portals give their buttons no stable id.
async function clickByText(page, text, { tags = 'a,button,div,span' } = {}) {
  return page.evaluate(
    (needle, tagList) => {
      const el = Array.from(document.querySelectorAll(tagList)).find(
        node => node.offsetParent !== null && (node.textContent || '').replace(/\s+/g, ' ').trim() === needle
      )

      if (el) {
        el.click()

        return true
      }

      return false
    },
    text,
    tags
  )
}

// Landing on the login URL again after submitting is the portals' shared
// failure signal — checked by hostname/path rather than an error selector,
// which every one of these sites rewrites regularly.
function stillOnLogin(page, marker) {
  return page.url().toLowerCase().includes(marker)
}

module.exports = { sleep, typeInto, clickByText, stillOnLogin }
