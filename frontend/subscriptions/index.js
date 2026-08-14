import { PipelineRequest } from '@shopgate/engage/core/classes';
import { logger } from '@shopgate/engage/core/helpers';
import { cookieConsentInitialized$, cookieConsentSet$ } from '@shopgate/engage/tracking/streams';
import { cartReceived$ } from '@shopgate/engage/cart/streams';
import getCartTrackingData from '@shopgate/pwa-tracking/selectors/cart';
import { sendTrackingRequest } from '../tracking/helpers';
import { getPageContext } from '../tracking/spaContext';

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

  // Cart update → Matomo cart update with the FULL, fresh cart. Tracked on cartReceived$
  // (after RECEIVE_CART) rather than on the add-to-cart event, because that event fires on
  // the optimistic add REQUEST before the cart store is updated. Uses the platform cart
  // tracking selector so prices/discounts match the web shop and the framework's own trackers.
  subscribe(cartReceived$, ({ getState }) => {
    const { products = [], amount = {} } = getCartTrackingData(getState()) || {};
    // Send even an empty cart (items: [], revenue: 0) so Matomo clears the abandoned cart
    // when the last item is removed — Matomo overwrites the visit cart with what we send.
    const items = products
      .filter(product => product && product.uid)
      .map(product => [
        product.uid,
        product.name || '',
        '',
        Number(product.amount && product.amount.gross) || 0,
        Number(product.quantity) || 1,
      ]);
    sendTrackingRequest('addToCart', getPageContext(), {
      items,
      revenue: Number(amount.gross) || 0,
    });
  });
}
