const MatomoClient = require('./matomo/Client')

/**
 * Pipeline step: forward a batch of normalized tracking events to Matomo in one bulk request.
 * @param {PipelineContext} context Context
 * @param {Object} input Input { events: [{ event, context, data }], visitor, sgxsMeta }
 * @returns {Promise<Object>} { success }
 */
module.exports = async (context, input) => (
  new MatomoClient(context).trackBatch(input)
)
