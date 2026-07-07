import SgTrackingPlugin from '@shopgate/tracking-core/plugins/Base';
import { getProductById } from '@shopgate/engage/product/selectors/product';
import { sendTrackingRequest } from './helpers';
import { getPageContext } from './spaContext';
import config from '../config.json';

const { trackProductPageview = true, trackSearch = true } = config || {};

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
    // search handler as a Matomo site search, so skip the pageview for them (else the
    // search page would be counted twice).
    this.register.pageview((data) => {
      if (data && data.search) {
        return;
      }
      const context = getPageContext(data && data.page && data.page.title);
      sendTrackingRequest('pageview', context, {});
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

    // Add to cart → Matomo cart update.
    this.register.addToCart((data, _scope, _blacklist, state) => {
      const items = (data && data.items) || [];
      if (!items.length) {
        return;
      }
      sendTrackingRequest('addToCart', getPageContext(), {
        items: toEcItems(items, state),
      });
    });

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

    // Wishlist add → Matomo event.
    this.register.addToWishlist((data) => {
      const [product] = (data && data.items) || [];
      if (!product || !product.id) {
        return;
      }
      sendTrackingRequest('event', getPageContext(), {
        category: 'Wishlist',
        action: 'Add to Wishlist',
        name: product.name || product.id,
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
