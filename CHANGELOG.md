# Changelog

All notable changes to `@shopgate-project/ext-tracking-matomo` are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.15] — unreleased

### Added
- `productIdentifier` config (`sku` | `id`, default `sku`): the same product identifier is
  now used consistently across product view, cart and purchase ecommerce events.

## [1.0.0-alpha.14]

### Changed
- Ecommerce product view now sends the top-level `_pks`/`_pkn`/`_pkc`/`_pkp` tracking
  parameters instead of visit-scoped `_cvar` custom variables.
- Cart updates are also sent for an empty cart (`ec_items: []`, `revenue: 0`), so Matomo
  clears the abandoned cart when the last item is removed.
- The frontend `test` script no longer points at a non-existent jest setup.

### Fixed
- The backend now throws on a non-2xx Matomo response, so `trackBatch` reports
  `success: false` and the pipeline surfaces the failure.

### Added
- `@shopgate/pwa-tracking` and `@shopgate/tracking-core` declared as frontend
  devDependencies (they are imported directly).
- Repository documentation: `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`.

## [1.0.0-alpha.13]
- Excluded the runnable unit test from the shipped bundle; `updateConsent` returns `{}`.

## [1.0.0-alpha.12]
- Fixed product-page double tracking and wrong page titles (category name): re-derive the
  real pageview data from state (`makeGetTrackingData` + `getCurrentRoute`), since
  tracking-core strips the pageview payload.

## [1.0.0-alpha.11]
- `siteBaseUrl` config: rewrite the tracked url/urlref origin to the shop domain so hits
  pass Matomo's "only track known URLs" filter.

## [1.0.0-alpha.8 – alpha.10]
- Full-cart tracking on `cartReceived$` (fresh cart) via the platform cart selector;
  fixed search double-tracking, wishlist name+SKU, add-to-cart price, consent-on-init merge.

## [1.0.0-alpha.4 – alpha.7]
- Addressed the first code review: purchase tax/search field fixes, falsy-zero handling,
  backend-owned visitor id, flush-on-hide, device `ua`/`lang`/`res`, URL shortening,
  `consentMarketing` gates on statistics consent.

## [1.0.0-alpha.1]
- Initial Matomo tracking extension (Scenario B, frontend + backend): pageview,
  viewContent, addToCart, purchase (native and web checkout), search, wishlist,
  login/registration; consent via the Shopgate Consent Manager; event batching.
