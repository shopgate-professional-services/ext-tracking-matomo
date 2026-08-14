/**
 * Pipeline step: persist the latest Shopgate Consent Manager decision for this device.
 * The trackEvent step reads it to decide whether (and how) to send to Matomo.
 *
 * Merges rather than overwrites: only flags that arrive as an explicit boolean are
 * updated, so a partial payload (e.g. a cookieConsentInitialized$ replay missing a field)
 * cannot silently reset a previously granted decision to false.
 * @param {PipelineContext} context Context
 * @param {Object} input Input { consent: { comfortCookiesAccepted, statisticsCookiesAccepted } }
 * @returns {Promise<Object>}
 */
module.exports = async (context, input) => {
  const consent = (input && input.consent) || {}
  const stored = (await context.storage.device.get('matomoConsent')) || {}
  const next = { ...stored }

  if (typeof consent.comfortCookiesAccepted === 'boolean') {
    next.comfortCookiesAccepted = consent.comfortCookiesAccepted
  }
  if (typeof consent.statisticsCookiesAccepted === 'boolean') {
    next.statisticsCookiesAccepted = consent.statisticsCookiesAccepted
  }

  await context.storage.device.set('matomoConsent', next)

  return {}
}
