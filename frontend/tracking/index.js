import Plugin from './Plugin';

/**
 * Creates the Matomo tracking plugin. Called by @shopgate/pwa-tracking once cookie
 * consent is initialized; `clientInformation` (incl. cookieConsent) is available but
 * consent enforcement happens server-side in the backend step, so it is not needed here.
 * @returns {Object}
 */
export default function init() {
  return new Plugin();
}
