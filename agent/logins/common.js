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
//
// exact:false falls back to a case-insensitive "contains" once no exact match
// is found — Snapdeal wraps its button labels in extra whitespace and nested
// spans, which the automation tolerates via Puppeteer's ::-p-text().
async function clickByText(page, text, { tags = 'a,button,div,span', exact = true } = {}) {
  return page.evaluate(
    (needle, tagList, exactMatch) => {
      const nodes = Array.from(document.querySelectorAll(tagList)).filter(node => node.offsetParent !== null)
      const label = node => (node.textContent || '').replace(/\s+/g, ' ').trim()

      let el = nodes.find(node => label(node) === needle)

      if (!el && !exactMatch) {
        const lowered = needle.toLowerCase()

        // Shortest match wins: on nested markup the ancestors carry the same
        // text, and clicking the innermost element is what a human does.
        el = nodes
          .filter(node => label(node).toLowerCase().includes(lowered))
          .sort((a, b) => label(a).length - label(b).length)[0]
      }

      if (el) {
        el.click()

        return true
      }

      return false
    },
    text,
    tags,
    exact
  )
}

// Landing on the login URL again after submitting is the portals' shared
// failure signal — checked by hostname/path rather than an error selector,
// which every one of these sites rewrites regularly.
function stillOnLogin(page, marker) {
  return page.url().toLowerCase().includes(marker)
}

module.exports = { sleep, typeInto, clickByText, stillOnLogin }
