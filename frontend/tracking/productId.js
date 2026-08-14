import { getProductById } from '@shopgate/engage/product/selectors/product';
import config from '../config.json';

// Which identifier to report for products across ALL ecommerce events (view/cart/purchase).
// Default 'sku'; 'id' uses the internal product id.
const USE_SKU = (config && config.productIdentifier) !== 'id';

/**
 * Resolves a product's SKU from state via its internal product id.
 * @param {Object} state Redux state.
 * @param {string} productId Internal product id.
 * @returns {string|undefined}
 */
function skuFor(state, productId) {
  if (!state || !productId) {
    return undefined;
  }
  const { productData } = getProductById(state, { productId }) || {};
  return (productData && productData.identifiers && productData.identifiers.sku) || undefined;
}

/**
 * Returns the configured Matomo product identifier for an item, consistently across events.
 * With `sku` (default) it prefers the known SKU, else resolves it from state, else falls back
 * to the id; with `id` it returns the internal id.
 * @param {{sku?: string, id: string}} product Known identifiers for the item.
 * @param {Object} [state] Redux state, used to resolve a missing SKU from the id.
 * @returns {string}
 */
export function resolveProductId({ sku, id }, state) {
  if (!USE_SKU) {
    return id;
  }
  return sku || skuFor(state, id) || id;
}
