/* eslint-disable */
/**
 * Runnable mapping verification for the Matomo client (no test framework required):
 *   node extension/lib/matomo/Client.spec.js
 * Exercises buildParams() for each event type and getConsentDecision() for each mode.
 */
const assert = require('assert')
const Client = require('./Client')

const baseContext = {
  config: {
    matomoUrl: 'https://matomo.example.com/',
    siteId: '7',
    tokenAuth: '',
    consentMode: 'alwaysTrack',
    cookielessTracking: false
  },
  storage: { device: { get: async () => null, set: async () => {} } },
  tracedRequest: () => () => {},
  log: { error: () => {} }
}

const ctx = {
  url: 'https://app/p/1',
  urlref: 'https://app/',
  title: 'Product 1',
  ua: 'Mozilla/5.0 (iPhone) Safari',
  lang: 'de-DE',
  res: '390x844'
}
const visitor = { id: 'a1b2c3d4e5f60718' }

function build (event, data, overrides = {}) {
  const client = new Client({ ...baseContext, config: { ...baseContext.config, ...overrides } })
  const cookieless = overrides.cookieless || false
  return client.buildParams({
    event,
    context: ctx,
    visitorId: cookieless ? null : visitor.id,
    data,
    decision: { track: true, cookieless },
    input: {}
  })
}

// endpoint normalization
assert.strictEqual(
  new Client(baseContext).endpoint,
  'https://matomo.example.com/matomo.php',
  'base url should get matomo.php appended'
)
assert.strictEqual(
  new Client({ ...baseContext, config: { ...baseContext.config, matomoUrl: 'https://m/matomo.php' } }).endpoint,
  'https://m/matomo.php',
  'full matomo.php url should be left as-is'
)

// URL shortening (Shopgate PWA build/CDN prefix → origin + /.../ + route)
const longUrl = 'https://sandbox.cdn.connect.shopgate.com/shop_32822/@shopgate/theme-ios11/7.31.1/1512359/index.html/category/3031386464356464'
const shortClient = new Client(baseContext)
assert.strictEqual(
  shortClient.shortenUrl(longUrl),
  'https://sandbox.cdn.connect.shopgate.com/.../category/3031386464356464',
  'Shopgate PWA url should keep origin + route, drop the build prefix'
)
assert.strictEqual(
  shortClient.shortenUrl('https://sandbox.cdn.connect.shopgate.com/shop_1/@shopgate/theme-ios11/7.31.1/1/index.html/item/abc?x=1#y'),
  'https://sandbox.cdn.connect.shopgate.com/.../item/abc',
  'query and hash are dropped as noise'
)
assert.strictEqual(
  shortClient.shortenUrl('https://sandbox.cdn.connect.shopgate.com/shop_1/@shopgate/theme-ios11/7.31.1/1/index.html/'),
  'https://sandbox.cdn.connect.shopgate.com/',
  'home page (empty route) collapses to origin/'
)
assert.strictEqual(
  shortClient.shortenUrl('https://foo.example/a/b/c/d/e'),
  'https://foo.example/a/.../e',
  'non-Shopgate url falls back to first + last segment'
)
assert.strictEqual(
  new Client({ ...baseContext, config: { ...baseContext.config, shortenUrls: false } }).shortenUrl(longUrl),
  longUrl,
  'shortenUrls=false leaves the url untouched'
)

// common params + visitor id
const pv = build('pageview', {})
assert.strictEqual(pv.idsite, '7')
assert.strictEqual(pv.rec, 1)
assert.strictEqual(pv.url, ctx.url)
assert.strictEqual(pv.urlref, ctx.urlref)
assert.strictEqual(pv.action_name, ctx.title)
assert.strictEqual(pv._id, visitor.id, 'valid 16-hex visitor id should be sent')
assert.strictEqual(pv.ua, ctx.ua, 'device user-agent should be forwarded')
assert.strictEqual(pv.lang, ctx.lang, 'device language should be forwarded')
assert.strictEqual(pv.res, ctx.res, 'screen resolution should be forwarded')

// cookieless drops the visitor id
const pvCookieless = build('pageview', {}, { cookieless: true })
assert.strictEqual(pvCookieless._id, undefined, 'cookieless must omit _id')

// viewContent → setEcommerceView custom variables
const vc = build('viewContent', { product: { id: '1', sku: 'SKU1', name: 'Shoe', price: 49.9 } })
const cvar = JSON.parse(vc._cvar)
assert.deepStrictEqual(cvar['1'], ['_pks', 'SKU1'])
assert.deepStrictEqual(cvar['2'], ['_pkn', 'Shoe'])
assert.deepStrictEqual(cvar['4'], ['_pkp', '49.9'])

// addToCart → cart update (idgoal 0, no ec_id, computed revenue)
const atc = build('addToCart', { items: [['SKU1', 'Shoe', '', 10, 2], ['SKU2', 'Hat', '', 5, 1]] })
assert.strictEqual(atc.idgoal, 0)
assert.strictEqual(atc.ec_id, undefined, 'cart update must not have an order id')
assert.strictEqual(atc.revenue, 25, '10*2 + 5*1 = 25')
assert.strictEqual(JSON.parse(atc.ec_items).length, 2)

// purchase → ecommerce order (idgoal 0 + ec_id + revenue)
const pur = build('purchase', { orderId: 'O-100', revenue: 59.9, tax: 9.5, items: [['SKU1', 'Shoe', '', 49.9, 1]] })
assert.strictEqual(pur.idgoal, 0)
assert.strictEqual(pur.ec_id, 'O-100')
assert.strictEqual(pur.revenue, 59.9)
assert.strictEqual(pur.ec_tx, 9.5)

// purchase with a legitimate 0 tax/shipping must be sent explicitly, not dropped
const purZero = build('purchase', { orderId: 'O-101', revenue: 20, tax: 0, shipping: 0, items: [] })
assert.strictEqual(purZero.ec_tx, 0, 'tax of 0 must be sent, not dropped')
assert.strictEqual(purZero.ec_sh, 0, 'shipping of 0 must be sent, not dropped')

// search (search_count of 0 must still be sent)
const se = build('search', { query: 'boots', count: 12 })
assert.strictEqual(se.search, 'boots')
assert.strictEqual(se.search_count, 12)
const seZero = build('search', { query: 'zzz', count: 0 })
assert.strictEqual(seZero.search_count, 0, 'zero results must be sent')

// generic event with a Matomo User ID
const evUid = build('event', { category: 'User', action: 'Login', uid: '4242' })
assert.strictEqual(evUid.uid, '4242', 'user id should be forwarded as Matomo uid')

// generic event
const ev = build('event', { category: 'User', action: 'Login' })
assert.strictEqual(ev.e_c, 'User')
assert.strictEqual(ev.e_a, 'Login')

// consent decisions
async function consentChecks () {
  const make = (mode, stored, cookieless) => new Client({
    ...baseContext,
    config: { ...baseContext.config, consentMode: mode, cookielessTracking: cookieless },
    storage: { device: { get: async () => stored, set: async () => {} } }
  })

  assert.deepStrictEqual(await make('neverTrack', null, true).getConsentDecision(), { track: false, cookieless: false })
  assert.deepStrictEqual(await make('alwaysTrack', null, false).getConsentDecision(), { track: true, cookieless: false })
  assert.deepStrictEqual(
    await make('consentStatistics', { statisticsCookiesAccepted: true }, false).getConsentDecision(),
    { track: true, cookieless: false }
  )
  assert.deepStrictEqual(
    await make('consentStatistics', { statisticsCookiesAccepted: false }, true).getConsentDecision(),
    { track: true, cookieless: true },
    'no consent + cookieless on → track cookieless'
  )
  assert.deepStrictEqual(
    await make('consentStatistics', { statisticsCookiesAccepted: false }, false).getConsentDecision(),
    { track: false, cookieless: true },
    'no consent + cookieless off → do not track'
  )
  // consentMarketing gates on the statistics flag (Marketing = Statistics).
  assert.deepStrictEqual(
    await make('consentMarketing', { statisticsCookiesAccepted: true }, false).getConsentDecision(),
    { track: true, cookieless: false }
  )
  assert.deepStrictEqual(
    await make('consentMarketing', { comfortCookiesAccepted: true, statisticsCookiesAccepted: false }, false).getConsentDecision(),
    { track: false, cookieless: true },
    'comfort-only consent must NOT enable marketing-mode tracking'
  )
}

// visitor id: created once and reused from device storage
async function visitorChecks () {
  const store = {}
  const client = new Client({
    ...baseContext,
    storage: { device: { get: async k => store[k], set: async (k, v) => { store[k] = v } } }
  })
  const first = await client.getVisitorId()
  assert.ok(/^[0-9a-f]{16}$/.test(first), 'visitor id is 16 hex chars')
  const second = await client.getVisitorId()
  assert.strictEqual(second, first, 'visitor id persists across calls')
}

Promise.all([consentChecks(), visitorChecks()])
  .then(() => console.log('All Matomo mapping + consent + visitor checks passed.'))
  .catch((e) => { console.error(e); process.exit(1) })
