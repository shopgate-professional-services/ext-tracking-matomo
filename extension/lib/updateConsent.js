/**
 * Pipeline step: persist the latest Shopgate Consent Manager decision for this device.
 * The trackEvent step reads it to decide whether (and how) to send to Matomo.
 * @param {PipelineContext} context Context
 * @param {Object} input Input { consent: { comfortCookiesAccepted, statisticsCookiesAccepted } }
 * @returns {Promise<void>}
 */
module.exports = async (context, input) => {
  await context.storage.device.set('matomoConsent', {
    comfortCookiesAccepted: input.consent.comfortCookiesAccepted === true,
    statisticsCookiesAccepted: input.consent.statisticsCookiesAccepted === true
  })
}
