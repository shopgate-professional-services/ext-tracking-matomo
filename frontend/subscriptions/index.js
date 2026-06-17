import { PipelineRequest } from '@shopgate/engage/core/classes';
import { logger } from '@shopgate/engage/core/helpers';
import { cookieConsentSet$ } from '@shopgate/engage/tracking/streams';

const UPDATE_CONSENT_PIPELINE = 'shopgate-project.ext-tracking-matomo.updateConsent';

/**
 * Matomo tracking subscriptions: forward Shopgate Consent Manager decisions to the
 * backend, where they gate whether (and how) events are sent to Matomo.
 * @param {Function} subscribe The subscribe function.
 */
export default function matomo(subscribe) {
  subscribe(cookieConsentSet$, async ({ action = {} }) => {
    const { comfortCookiesAccepted, statisticsCookiesAccepted } = action;

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
  });
}
