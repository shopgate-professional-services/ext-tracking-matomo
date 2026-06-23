import { PipelineRequest } from '@shopgate/engage/core/classes';
import { logger } from '@shopgate/engage/core/helpers';

export const TRACK_EVENT_PIPELINE = 'shopgate-project.ext-tracking-matomo.trackEvent';

// Events that fire within this window (e.g. pageview + viewContent on a PDP open) are
// coalesced into ONE pipeline call → one bulk matomo.php request → one DB transaction,
// which avoids Matomo's "Record has changed … restarting transaction" lock collision.
const FLUSH_DELAY = 60;

let queue = [];
let timer = null;

/**
 * Flushes the queued events as a single pipeline request. The visitor id is resolved
 * and attached server-side (device storage), so a session stitches into one Matomo visit.
 */
function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) {
    return;
  }
  const events = queue;
  queue = [];

  new PipelineRequest(TRACK_EVENT_PIPELINE)
    .setInput({ events })
    .dispatch()
    .catch((err) => {
      logger.error('Matomo tracking could not be sent', err);
    });
}

// Flush immediately when the app/WebView is about to be hidden or torn down, so events
// queued in the last FLUSH_DELAY ms (notably a web-checkout purchase) are not lost.
if (typeof document !== 'undefined' && document.addEventListener) {
  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  };
  document.addEventListener('visibilitychange', flushOnHide);
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', flush);
  }
}

/**
 * Queues one normalized tracking event. The SPA context is captured now (at event time),
 * so batching does not distort url/urlref/title. Flushed shortly after on a timer.
 * @param {string} event The event name (pageview, viewContent, addToCart, purchase, …).
 * @param {Object} context SPA context { url, urlref, title }.
 * @param {Object} data Event payload (commerce data, query, user, …).
 */
export const sendTrackingRequest = (event, context, data = {}) => {
  // Stamp the true event time so the backend can send Matomo's cdt (original timestamp)
  // for events that are batched/queued and arrive a moment later.
  queue.push({ event, context: { ...context, timestamp: Date.now() }, data });
  if (!timer) {
    timer = setTimeout(flush, FLUSH_DELAY);
  }
};
