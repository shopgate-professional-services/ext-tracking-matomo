import { PipelineRequest } from '@shopgate/engage/core/classes';
import { logger } from '@shopgate/engage/core/helpers';
import { cookieConsentInitialized$, cookieConsentSet$ } from '@shopgate/engage/tracking/streams';

const UPDATE_CONSENT_PIPELINE = 'shopgate-project.ext-tracking-matomo.updateConsent';

/**
 * Forwards a Shopgate Consent Manager decision to the backend, where it gates whether
 * (and how) events are sent to Matomo.
 * @param {Object} action The consent action ({ comfortCookiesAccepted, statisticsCookiesAccepted }).
 */
function forwardConsent({ comfortCookiesAccepted, statisticsCookiesAccepted }) {
  new PipelineRequest(UPDATE_CONSENT_PIPELINE)
    .setInput({
      consent: {
        comfortCookiesAccepted,
        statisticsCookiesAccepted,
      },
    })
    .dispatch()
    .catch((err) => {
      logger.error('Matomo cookie consent update could not be sent', err);
    });
}

/**
 * Matomo tracking subscriptions.
 * @param {Function} subscribe The subscribe function.
 */
export default function matomo(subscribe) {
  // Seed the standing consent decision on app start (so an existing decision from a prior
  // session is honored), and keep it in sync on every later change.
  subscribe(cookieConsentInitialized$, ({ action = {} }) => forwardConsent(action));
  subscribe(cookieConsentSet$, ({ action = {} }) => forwardConsent(action));
}
