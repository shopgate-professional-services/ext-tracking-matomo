import { PipelineRequest } from '@shopgate/engage/core/classes';
import { logger } from '@shopgate/engage/core/helpers';
import { getVisitorId } from './visitor';

export const TRACK_EVENT_PIPELINE = 'shopgate-project.ext-tracking-matomo.trackEvent';

// Events that fire within this window (e.g. pageview + viewContent on a PDP open) are
// coalesced into ONE pipeline call → one bulk matomo.php request → one DB transaction,
// which avoids Matomo's "Record has changed … restarting transaction" lock collision.
const FLUSH_DELAY = 60;

let queue = [];
let timer = null;

/**
 * Flushes the queued events as a single pipeline request.
 */
function flush() {
  timer = null;
  if (!queue.length) {
    return;
  }
  const events = queue;
  queue = [];

  new PipelineRequest(TRACK_EVENT_PIPELINE)
    .setInput({
      visitor: { id: getVisitorId() },
      events,
    })
    .dispatch()
    .catch((err) => {
      logger.error('Matomo tracking could not be sent', err);
    });
}

/**
 * Queues one normalized tracking event. The SPA context is captured now (at event time),
 * so batching does not distort url/urlref/title. Flushed shortly after on a timer.
 * @param {string} event The event name (pageview, viewContent, addToCart, purchase, …).
 * @param {Object} context SPA context { url, urlref, title }.
 * @param {Object} data Event payload (commerce data, query, user, …).
 */
export const sendTrackingRequest = (event, context, data = {}) => {
  queue.push({ event, context, data });
  if (!timer) {
    timer = setTimeout(flush, FLUSH_DELAY);
  }
};
