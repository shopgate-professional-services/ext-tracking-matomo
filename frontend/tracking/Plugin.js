import SgTrackingPlugin from '@shopgate/tracking-core/plugins/Base';
import { getProductById } from '@shopgate/engage/product/selectors/product';
import { getCurrentRoute } from '@shopgate/engage/core/selectors';
import { makeGetTrackingData } from '@shopgate/pwa-tracking/selectors';
import { sendTrackingRequest } from './helpers';
import { getPageContext } from './spaContext';
import config from '../config.json';

const { trackProductPageview = true, trackSearch = true } = config || {};

// tracking-core strips the pageview payload down to { page: { merchantUrl, shopgateUrl } },
// so re-derive the full pageview data (title, category, product, search) from state via
// the platform's own selector — same source pwa-tracking uses.
const getTrackingData = makeGetTrackingData();

/**
 * Coerces a value to a finite number, preserving a legitimate 0; returns undefined
 * otherwise (so e.g. a free-shipping 0 is sent explicitly, not dropped as "unknown").
 * @param {*} value The value to coerce.
 * @returns {number|undefined}
 */
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Extracts a stable, pseudonymous user identifier (customer id) from a tracking user
 * payload for use as the Matomo User ID. Returns undefined when no id is available.
 * @param {Object} user The user object from a login/registration tracking event.
 * @returns {string|undefined}
 */
const getUserId = (user) => {
  const id = user && (user.id || user.customerId || (user.user && user.user.id));
  return id != null && id !== '' ? String(id) : undefined;
};

/**
 * Maps Shopgate cart/order item shape to Matomo ec_items tuples.
 * Matomo expects [ sku, name, category, price, quantity ]. The unified tracking item
 * carries no category, so that column stays empty unless the source data gains one.
 * When the item price is missing (e.g. add-to-cart before the product is fully loaded),
 * it is enriched from the product selector using `state`.
 * @param {Array} items Normalized tracking items.
 * @param {Object} [state] Redux state, used to look up a missing price.
 * @returns {Array[]}
 */
const toEcItems = (items = [], state) =>
  items
    .filter(item => item && item.id)
    .map((item) => {
      let price = Number(item.priceGross) || 0;
      if (!price && state) {
        const { productData } = getProductById(state, { productId: item.id }) || {};
        price = Number(productData && productData.price && productData.price.unitPrice) || 0;
      }
      return [
        item.id,
        item.name || '',
        item.category || '',
        price,
        Number(item.quantity) || 1,
      ];
    });

/**
 * Tracking plugin that forwards Shopgate tracking events to Matomo.
 */
class MatomoAnalytics extends SgTrackingPlugin {
  /**
   * Initializes the tracking plugin.
   */
  constructor() {
    super('matomo');
    this.registerEvents();
  }

  /**
   * Registers all event handlers.
   */
  registerEvents() {
    // Pageviews for category / content pages. Search result pages are handled by the
    // search handler (Matomo site search) and product pages by the viewContent handler
    // (which sends a pageview + setEcommerceView in one hit), so skip those here — else
    // the page would be counted twice.
    this.register.pageview((_data, _scope, _blacklist, state) => {
      // Re-derive the real pageview data from state (the event payload is stripped).
      const pv = (state && getTrackingData(state, getCurrentRoute(state))) || {};
      // Only skip when the OTHER handler actually tracks the page, else it would vanish:
      // product pages → viewContent (if trackProductPageview), search pages → search handler.
      if (trackProductPageview && pv.product) {
        return;
      }
      if (trackSearch && pv.search) {
        return;
      }
      // Real title: for a category use its name; otherwise the page/CMS title. (Not the
      // generic document.title, which is the shop name on every page.)
      const title = (pv.category && pv.category.name)
        || (pv.page && pv.page.title)
        || undefined;
      sendTrackingRequest('pageview', getPageContext(title), {});
    });

    // Product detail view → Matomo setEcommerceView (page-scoped _pk* custom variables).
    if (trackProductPageview) {
      this.register.viewContent((data, _scope, _blacklist, state) => {
        const id = data && data.id;
        const { productData: product } = (id && getProductById(state, { productId: id })) || {};
        const context = getPageContext(product && product.name);
        sendTrackingRequest('viewContent', context, {
          product: product
            ? {
              id,
              sku: (product.identifiers && product.identifiers.sku) || id,
              name: product.name,
              price: product.price && product.price.unitPrice,
            }
            : { id },
        });
      });
    }

    // Add-to-cart / cart updates are tracked in frontend/subscriptions/index.js on
    // cartReceived$ (after RECEIVE_CART), where the cart store already reflects the change.
    // The register.addToCart event fires on the optimistic add REQUEST, before the cart
    // store is updated, so reading the cart here would send a stale (one-item-behind) cart.

    // Purchase → Matomo ecommerce order. Fires for BOTH native and web checkout.
    this.register.purchase((data, _scope, _blacklist, state) => {
      const items = (data && data.items) || [];
      if (!data || !data.id) {
        return;
      }
      sendTrackingRequest('purchase', getPageContext(), {
        orderId: data.id,
        revenue: toNumber(data.revenueGross) || 0,
        currency: data.currency,
        tax: toNumber(data.tax),
        shipping: toNumber(data.shippingGross),
        items: toEcItems(items, state),
      });
    });

    // Site search.
    if (trackSearch) {
      this.register.search((data) => {
        const query = data && data.query;
        if (!query) {
          return;
        }
        sendTrackingRequest('search', getPageContext(), {
          query,
          count: toNumber(data.hits),
        });
      });
    }

    // Wishlist add → Matomo event, labelled with the product name and SKU.
    this.register.addToWishlist((data, _scope, _blacklist, state) => {
      const [product] = (data && data.items) || [];
      if (!product || !product.id) {
        return;
      }
      const { productData } = getProductById(state, { productId: product.id }) || {};
      const sku = (productData && productData.identifiers && productData.identifiers.sku) || product.id;
      const productName = product.name || (productData && productData.name);
      sendTrackingRequest('event', getPageContext(), {
        category: 'Wishlist',
        action: 'Add to Wishlist',
        name: productName ? `${productName} (${sku})` : sku,
      });
    });

    // Login / registration → Matomo events, tagged with the Matomo User ID
    // (a pseudonymous customer id, when available) for cross-device user stitching.
    this.register.loginSuccess((data) => {
      sendTrackingRequest('event', getPageContext(), {
        category: 'User',
        action: 'Login',
        uid: getUserId(data),
      });
    });

    this.register.completedRegistration((data) => {
      sendTrackingRequest('event', getPageContext(), {
        category: 'User',
        action: 'Registration',
        uid: getUserId(data),
      });
    });
  }
}

export default MatomoAnalytics;
