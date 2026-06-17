import SgTrackingPlugin from '@shopgate/tracking-core/plugins/Base';
import { getProductById } from '@shopgate/engage/product/selectors/product';
import { sendTrackingRequest } from './helpers';
import { getPageContext, advancePage } from './spaContext';
import config from '../config.json';

const { trackProductPageview = true, trackSearch = true } = config || {};

/**
 * Maps Shopgate cart/order item shape to Matomo ec_items tuples.
 * Matomo expects [ sku, name, category, price, quantity ].
 * @param {Array} items Normalized tracking items.
 * @returns {Array[]}
 */
const toEcItems = (items = []) =>
  items
    .filter(item => item && item.id)
    .map(item => [
      item.id,
      item.name || '',
      item.category || '',
      Number(item.priceGross) || 0,
      Number(item.quantity) || 1,
    ]);

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
    // Pageviews for category / content / search result pages.
    this.register.pageview((data) => {
      const context = getPageContext(data && data.page && data.page.title);
      sendTrackingRequest('pageview', context, {});
      advancePage();
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
        advancePage();
      });
    }

    // Add to cart → Matomo cart update.
    this.register.addToCart((data) => {
      const items = (data && data.items) || [];
      if (!items.length) {
        return;
      }
      sendTrackingRequest('addToCart', getPageContext(), {
        items: toEcItems(items),
      });
    });

    // Purchase → Matomo ecommerce order. Fires for BOTH native and web checkout.
    this.register.purchase((data) => {
      const items = (data && data.items) || [];
      if (!data || !data.id) {
        return;
      }
      sendTrackingRequest('purchase', getPageContext(), {
        orderId: data.id,
        revenue: Number(data.revenueGross) || 0,
        currency: data.currency,
        tax: Number(data.taxGross) || undefined,
        shipping: Number(data.shippingGross) || undefined,
        items: toEcItems(items),
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
          count: typeof data.resultCount === 'number' ? data.resultCount : undefined,
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
        name: product.id,
      });
    });

    // Login / registration → Matomo events.
    this.register.loginSuccess(() => {
      sendTrackingRequest('event', getPageContext(), {
        category: 'User',
        action: 'Login',
      });
    });

    this.register.completedRegistration(() => {
      sendTrackingRequest('event', getPageContext(), {
        category: 'User',
        action: 'Registration',
      });
    });
  }
}

export default MatomoAnalytics;
