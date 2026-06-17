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
16-hex visitor id (`_id`) is generated client-side and sent on every event so a
session stitches into one Matomo visit.

## Events

| Shopgate event | Matomo |
| --- | --- |
| pageview | pageview (`url`, `urlref`, `action_name`) |
| viewContent (product) | `setEcommerceView` via page-scoped `_pk*` custom variables |
| addToCart | cart update (`idgoal=0`, `ec_items`, computed `revenue`, no `ec_id`) |
| purchase (native **and** web checkout) | ecommerce order (`idgoal=0`, `ec_id`, `revenue`, `ec_items`) |
| search | site search (`search`, `search_count`) |
| addToWishlist / login / registration | Matomo events (`e_c` / `e_a` / `e_n`) |

## Configuration (Developer Center)

| Key | Dest | Notes |
| --- | --- | --- |
| `matomoUrl` | backend | Base URL or full `…/matomo.php`. |
| `siteId` | backend | Matomo `idSite`. |
| `tokenAuth` | backend | Optional; needed for `cip` (real device IP) and `cdt` (queued events). Stored server-side only. |
| `consentMode` | backend | `alwaysTrack` / `neverTrack` / `consentStatistics` / `consentMarketing`. |
| `cookielessTracking` | backend | When consent is missing: track without a persistent visitor id, or stay silent. |
| `trackProductPageview` | frontend | Toggle product detail view tracking. |
| `trackSearch` | frontend | Toggle site search tracking. |

## Consent

Consent comes from the [Shopgate Consent Manager](https://docs.shopgate.com/docs/connect-doc/3npp9umgibvh5-shopgate-consent-manager).
The frontend subscriber forwards `cookieConsentSet$` decisions to the backend
(`updateConsent` pipeline → device storage); the `trackEvent` step reads them and
applies `consentMode` (+ `cookielessTracking`).

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

## Open items / tuning

- **addToCart** sends only the *added* item(s). Matomo cart updates are meant to
  carry the **full** current cart; enrich with a cart selector if exact cart
  contents matter for the merchant.
- **setEcommerceView** uses page custom-variable indexes 1–4. Confirm these don't
  collide with custom variables the merchant already uses in their Matomo.
- **Device IP / user agent**: `cip` is set from `sgxsMeta.deviceIp` only when
  `tokenAuth` is configured; `ua`/`lang` are not yet forwarded.
- **Original timestamp (`cdt`)**: wired but the frontend does not yet stamp
  `context.timestamp` for queued/backgrounded events.
