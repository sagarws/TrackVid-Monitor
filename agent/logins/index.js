// Platform registry. Each module exports { key, label, homeUrl, login(page, credentials) }.
//
// Ported from Automated-scripts, one flow per marketplace, trimmed to the login
// step. Selectors drift — when a portal changes its markup, the fix belongs
// here AND in the corresponding Automated-scripts flow, which will be failing
// for the same reason.

const myntra = require('./myntra')
const ajio = require('./ajio')
const snapdeal = require('./snapdeal')
const meesho = require('./meesho')
const flipkart = require('./flipkart')
const nykaa = require('./nykaa')
const delhivery = require('./delhivery')
const xbees = require('./xbees')

const PLATFORMS = { myntra, ajio, snapdeal, meesho, flipkart, nykaa, delhivery, xbees }

const getPlatform = key => PLATFORMS[String(key || '').trim().toLowerCase()] || null

const supportedPlatforms = () =>
  Object.values(PLATFORMS).map(p => ({ key: p.key, label: p.label, homeUrl: p.homeUrl }))

module.exports = { getPlatform, supportedPlatforms }
