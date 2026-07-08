# @shopgate-project/ext-tracking-matomo

Forwards Shopgate PWA tracking events to [Matomo](https://matomo.org) via the
Matomo HTTP Tracking API (`matomo.php`).

## Architecture (Scenario B — frontend + backend)

```
PWA event (pwa-tracking)
  → frontend tracking plugin (frontend/tracking/Plugin.js)   maps event + captures SPA context
  → pipeline shopgate-project.ext-tracking-matomo.trackEvent  (frontend → backend)
  → backend step (extension/lib/trackEvent.js → matomo/Client.js)
  → Matomo HTTP Tracking API (matomo.php)
```

The backend transport keeps `token_auth` server-side, is adblock-safe, and allows
server-side IP / original-timestamp control.

### Why a backend pipeline and not the matomo.js tracker?
matomo.php has no browser context, so the **frontend** captures `url`, `urlref`
(previous in-app page) and `title` and forwards them — this is how SPA tracking
is satisfied (see <https://developer.matomo.org/guides/spa-tracking>). A stable
16-hex visitor id (`_id`) is owned by the backend (persisted in device storage) and
attached to every event so a session stitches into one Matomo visit.

## Events

| Shopgate event | Matomo |
| --- | --- |
| pageview | pageview (`url`, `urlref`, `action_name`) |
| viewContent (product) | product pageview + `setEcommerceView` (page-scoped `_pk*` custom variables) in **one** hit; the plain pageview is suppressed on product pages so they are not counted twice |
| cart update | cart update with the **full current cart** (`idgoal=0`, all `ec_items`, cart `revenue`, no `ec_id`), tracked on `cartReceived$` (after the cart store is updated) |
| purchase (native **and** web checkout) | ecommerce order (`idgoal=0`, `ec_id`, `revenue`, `ec_items`) |
| search | site search (`search`, `search_count`); the search page's pageview is suppressed (only when `trackSearch` is on) so it is not counted twice |
| addToWishlist | Matomo event (`Wishlist` / `Add to Wishlist` / **`product name (SKU)`**) |
| login / registration | Matomo event + User ID (`uid`, pseudonymous customer id when available) |

Cart updates are tracked in `frontend/subscriptions/index.js` on `cartReceived$` — not on
the add-to-cart event, which fires on the optimistic add request before the cart store is
updated (so the cart would be one item behind). The full cart + value come from the
platform cart tracking selector (`@shopgate/pwa-tracking/selectors/cart`), so prices and
discounts match the web shop and the framework's own trackers.

## Configuration (Developer Center)

| Key | Dest | Notes |
| --- | --- | --- |
| `matomoUrl` | backend | Base URL or full `…/matomo.php`. |
| `siteId` | backend | Matomo `idSite`. |
| `tokenAuth` | backend | Optional; needed for `cip` (real device IP) and `cdt` (queued events). Stored server-side only. |
| `consentMode` | backend | `alwaysTrack` / `neverTrack` / `consentStatistics` / `consentMarketing`. `consentMarketing` gates on the statistics flag (the Consent Manager has no separate marketing category). |
| `cookielessTracking` | backend | When consent is missing: track without a persistent visitor id, or stay silent. |
| `trackProductPageview` | frontend | Toggle product detail view tracking. |
| `trackSearch` | frontend | Toggle site search tracking. |
| `shortenUrls` | backend | Drop the Shopgate PWA build/CDN path prefix from tracked URLs (default on). |

### URL shortening (`shortenUrls`, on by default)

Shopgate PWA URLs carry a long build/CDN prefix (shop id, theme, version, build hash,
`index.html`) before the actual route. Only the origin and the route are meaningful for
Matomo, so the backend rewrites:

```
https://…shopgate.com/shop_32822/@shopgate/theme-ios11/7.31.1/1512359/index.html/category/3031…
→ https://…shopgate.com/.../category/3031…
```

Applied consistently to `url` and `urlref`; query/hash are dropped. Non-Shopgate URLs
fall back to `origin/<first>/.../<last>`. Turn off to send the full URL.

## Consent

Consent comes from the [Shopgate Consent Manager](https://docs.shopgate.com/docs/connect-doc/3npp9umgibvh5-shopgate-consent-manager).
The frontend subscriber forwards both the **initial** decision (`cookieConsentInitialized$`,
so a standing decision from a prior session is honored on app start) and every later
change (`cookieConsentSet$`) to the backend (`updateConsent` pipeline → device storage);
the `trackEvent` step reads them and applies `consentMode` (+ `cookielessTracking`).

## Visitor id

The stable per-device visitor id (`_id`) is generated and persisted **server-side** in
the bridge-backed device storage (`extension/lib/matomo/Client.js`), not the WebView's
`localStorage` — so it reliably survives app restarts and a session stitches into one
Matomo visit. It is omitted under cookieless tracking.

## Tests

Backend mapping + consent logic:

```
node extension/lib/matomo/Client.spec.js
```

## Event batching

Events that fire within ~60ms of each other (e.g. `pageview` + `viewContent` on a
PDP open) are coalesced in the frontend (`tracking/helpers.js`) into **one** pipeline
call, and the backend sends them as **one** bulk `matomo.php` request
(`{ requests: [...] }`). Matomo then processes them in a single transaction, which
avoids the `SQLSTATE 1020 Record has changed … try restarting transaction` lock
collision that separate parallel hits to the same visit row would otherwise cause.
The queue is also flushed immediately on `visibilitychange`/`pagehide`, so events
queued in the last ~60ms (notably a web-checkout purchase) are not lost when the app
backgrounds. Each queued event is stamped with its true time so the backend can send
Matomo's `cdt` original timestamp (when `tokenAuth` is configured).

## Open items / tuning

- **`ec_items` category** column is always empty: the unified Shopgate tracking item
  carries no category. Source it elsewhere (e.g. a product property) if needed.
- **setEcommerceView** uses page custom-variable indexes 1–4. Confirm these don't
  collide with custom variables the merchant already uses in their Matomo.
- **Device detection**: the real device `ua` (user-agent), `lang` and `res` (screen
  resolution) are captured in the webview and forwarded so Matomo detects the actual
  device/OS/browser (verified on Matomo 5.11: `ua` is honored **without** `tokenAuth` →
  iPhone / iOS / Mobile Safari / resolution detected). The real device IP (`cip`, for
  geolocation) still requires `tokenAuth` and is sent from `sgxsMeta.deviceIp` only then.
- **User ID** uses the customer id field if present on the login/registration payload;
  confirm the exact field for the target shop.
