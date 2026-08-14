# Changelog

All notable changes to `@shopgate-project/ext-tracking-matomo` are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0]

Initial release — forwards Shopgate Connect PWA tracking events to a Matomo instance via a
backend pipeline (Scenario B: frontend tracking plugin → pipeline → backend step → Matomo
HTTP Tracking API).

### Tracked events

- **Pageview** for category/content pages, with the real page/category title.
- **Product view** via `setEcommerceView` (top-level `_pks`/`_pkn`/`_pkc`/`_pkp` params);
  the plain pageview is suppressed on product pages so they are not counted twice.
- **Cart update** with the full current cart (tracked on `RECEIVE_CART` so the cart is
  fresh); an empty cart is also sent so Matomo clears the abandoned cart on removal.
- **Purchase** — ecommerce order for both native and web checkout.
- **Site search**, **wishlist**, and **login/registration** (with Matomo User ID).

### Features

- Backend-owned persistent visitor id (device storage) so a session stitches into one visit.
- Event batching into one bulk `matomo.php` request; flushed on app hide.
- Real device user-agent / language / screen resolution forwarded (`ua`/`lang`/`res`).
- Consent via the Shopgate Consent Manager: `consentMode`
  (`alwaysTrack`/`neverTrack`/`consentStatistics`/`consentMarketing`) plus a cookieless
  fallback; consent is seeded on start and kept in sync (merged, not overwritten).
- Configurable product identifier (`productIdentifier`: `sku` | `id`), applied consistently
  across all ecommerce events.
- URL handling: `shortenUrls` (drop the Shopgate build/CDN path prefix) and `siteBaseUrl`
  (rewrite the origin to the shop domain so hits pass Matomo's "only track known URLs" filter).
- The backend throws on non-2xx Matomo responses so tracking failures surface in the pipeline.

### Configuration

`matomoUrl`, `siteId`, `tokenAuth`, `consentMode`, `cookielessTracking`, `shortenUrls`,
`siteBaseUrl` (backend); `trackProductPageview`, `trackSearch`, `productIdentifier` (frontend).
See `README.md`.
