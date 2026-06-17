const { promisify } = require('util')

/**
 * Builds and sends events to the Matomo HTTP Tracking API (matomo.php).
 *
 * The frontend has the browser context (url, referrer, title, visitor id) and forwards
 * it through the pipeline, because matomo.php has no browser context server-side
 * (see developer.matomo.org/guides/spa-tracking translated to the HTTP API).
 */
class Client {
  /**
   * @param {Object} context Pipeline context.
   */
  constructor ({ config, storage, tracedRequest, log }) {
    const baseUrl = (config.matomoUrl || '').trim()
    this.endpoint = /matomo\.php$/.test(baseUrl)
      ? baseUrl
      : `${baseUrl.replace(/\/?$/, '/')}matomo.php`
    this.siteId = config.siteId
    this.tokenAuth = config.tokenAuth || ''
    this.consentMode = config.consentMode || 'consentStatistics'
    this.cookielessTracking = config.cookielessTracking === true
    this.storage = storage
    this.tracedRequest = tracedRequest
    this.log = log
  }

  /**
   * Resolves the current consent decision from consentMode + the stored consent flags.
   * @returns {Promise<{track: boolean, cookieless: boolean}>}
   */
  async getConsentDecision () {
    if (this.consentMode === 'neverTrack') {
      return { track: false, cookieless: false }
    }
    if (this.consentMode === 'alwaysTrack') {
      return { track: true, cookieless: false }
    }

    const {
      comfortCookiesAccepted = false,
      statisticsCookiesAccepted = false
    } = (await this.storage.device.get('matomoConsent')) || {}

    const granted = this.consentMode === 'consentMarketing'
      ? comfortCookiesAccepted === true
      : statisticsCookiesAccepted === true

    if (granted) {
      return { track: true, cookieless: false }
    }
    // Consent missing: cookieless fallback if enabled, otherwise nothing.
    return { track: this.cookielessTracking, cookieless: true }
  }

  /**
   * Forwards a batch of normalized tracking events to Matomo in a single bulk request.
   * Sending events that fired together in one request makes Matomo process them in one
   * transaction, avoiding the parallel-write lock collision on matomo_log_visit.
   * @param {Object} input { events: [{ event, context, data }], visitor, sgxsMeta }
   * @returns {Promise<{success: boolean}>}
   */
  async trackBatch (input) {
    if (!this.endpoint || !this.siteId) {
      this.log.error('Matomo error: matomoUrl/siteId not configured')
      return { success: false }
    }

    const { events = [], visitor = {} } = input || {}
    if (!Array.isArray(events) || events.length === 0) {
      return { success: false }
    }

    const decision = await this.getConsentDecision()
    if (!decision.track) {
      return { success: false }
    }

    const requests = events
      .filter(e => e && e.event)
      .map(e => this.toQuery(
        this.buildParams({
          event: e.event,
          context: e.context || {},
          visitor,
          data: e.data || {},
          decision,
          input
        })
      ))

    if (requests.length === 0) {
      return { success: false }
    }

    try {
      await this.request(requests)
      return { success: true }
    } catch (e) {
      this.log.error(e, 'Matomo error')
      return { success: false }
    }
  }

  /**
   * Builds the matomo.php parameter map for a single event.
   * @param {Object} args Event arguments.
   * @returns {Object}
   */
  buildParams ({ event, context, visitor, data, decision, input }) {
    const params = {
      idsite: this.siteId,
      rec: 1,
      apiv: 1,
      send_image: 0,
      rand: `${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      url: context.url || undefined,
      urlref: context.urlref || undefined,
      action_name: context.title || undefined
    }

    // Stable visitor id stitches a session into one Matomo visit. Omitted when cookieless.
    if (!decision.cookieless && /^[0-9a-f]{16}$/.test(visitor.id || '')) {
      params._id = visitor.id
    }

    // Server-side IP / original timestamp require token_auth.
    if (this.tokenAuth) {
      const deviceIp = input && input.sgxsMeta && input.sgxsMeta.deviceIp
      if (deviceIp) {
        params.cip = deviceIp
      }
      if (context.timestamp) {
        params.cdt = Math.floor(Number(context.timestamp) / 1000)
      }
    }

    switch (event) {
      case 'pageview':
        break

      case 'viewContent': {
        // setEcommerceView → page-scoped _pk* custom variables.
        const p = data.product || {}
        params._cvar = JSON.stringify({
          1: ['_pks', String(p.sku || p.id || '')],
          2: ['_pkn', String(p.name || '')],
          3: ['_pkc', String(p.category || '')],
          4: ['_pkp', String(p.price != null ? p.price : '')]
        })
        break
      }

      case 'addToCart':
        // Cart update = ecommerce goal 0 WITHOUT an order id.
        params.idgoal = 0
        params.ec_items = JSON.stringify(data.items || [])
        params.revenue = (data.items || []).reduce(
          (sum, [, , , price, qty]) => sum + (Number(price) || 0) * (Number(qty) || 1),
          0
        )
        break

      case 'purchase':
        params.idgoal = 0
        params.ec_id = String(data.orderId)
        params.revenue = Number(data.revenue) || 0
        if (data.tax != null) params.ec_tx = data.tax
        if (data.shipping != null) params.ec_sh = data.shipping
        params.ec_items = JSON.stringify(data.items || [])
        break

      case 'search':
        params.search = data.query
        if (typeof data.count === 'number') {
          params.search_count = data.count
        }
        break

      case 'event':
        params.e_c = data.category
        params.e_a = data.action
        if (data.name != null) params.e_n = data.name
        if (data.value != null) params.e_v = data.value
        break

      default:
        this.log.error(`Matomo error: unknown event "${event}"`)
    }

    return params
  }

  /**
   * Serializes a matomo.php parameter map to a `?a=b&c=d` query string.
   * @param {Object} params matomo.php parameters.
   * @returns {string}
   */
  toQuery (params) {
    const query = Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== '')
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')
    return `?${query}`
  }

  /**
   * Sends one or more tracking requests to matomo.php as a single bulk request
   * (one transaction Matomo-side; keeps token_auth out of the URL).
   * @param {string[]} requests Query strings (each like `?idsite=…&rec=1&…`).
   * @returns {Promise<void>}
   */
  async request (requests) {
    const body = { requests }
    if (this.tokenAuth) {
      body.token_auth = this.tokenAuth
    }

    const response = await promisify(this.tracedRequest('Matomo'))({
      uri: this.endpoint,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      json: true
    })

    if (response.statusCode >= 400) {
      this.log.error(
        { statusCode: response.statusCode, body: response.body },
        `Matomo error code ${response.statusCode} in response`
      )
    }
  }
}

module.exports = Client
