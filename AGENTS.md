# AGENTS.md

Guidance for AI agents and contributors working on `@shopgate-project/ext-tracking-matomo`.

## What this is

A Shopgate Connect PWA extension (Scenario B — frontend + backend) that forwards Shopgate
tracking events to a Matomo instance via a backend pipeline. See `README.md` for the full
event map and configuration.

```
PWA event → frontend tracking plugin → pipeline → backend step → Matomo HTTP API (matomo.php)
```

## Layout

- `frontend/tracking/` — the tracking plugin (`Plugin.js`), SPA context, helpers (batching).
- `frontend/subscriptions/` — consent forwarding + cart tracking (`cartReceived$`).
- `extension/lib/matomo/Client.js` — builds and sends the `matomo.php` requests.
- `extension/lib/{trackEvent,updateConsent}.js` — pipeline steps.
- `pipelines/` — `shopgate-project.ext-tracking-matomo.{trackEvent,updateConsent}.v1`.
- `extension-config.json` — components (`tracking`, `subscribers`) + admin configuration.

## Develop / test / release

- Tests live in the dev workspace (`../../matomo-local/`), NOT in the shipped extension:
  `node ../../matomo-local/Client.spec.js` and `.../integration-test.js`.
- **Before every upload / MR, run the KB `extension-reviewer` skill** and address findings.
- Upload: `sgconnect extension upload @shopgate-project-ext-tracking-matomo`. This scope
  (`@shopgate-project`) is auto-released, so the CLI returns "RELEASED" — that is expected,
  not an error; distribution is via the git repo.

## Gotchas (learned the hard way)

- **Event payloads are reshaped by tracking-core** (`dataFormatHelpers`) before reaching the
  plugin handlers. The pageview payload is stripped to `{ page: { merchantUrl, shopgateUrl } }`
  — re-derive real data from state via `makeGetTrackingData()` + `getCurrentRoute`. Verify the
  fields a handler reads actually exist in the *unified* shape, not the raw selector shape.
- **Cart events fire on the optimistic `ADD_PRODUCTS_TO_CART` request**, before the cart store
  updates (`RECEIVE_CART`). Track the cart on `cartReceived$`, not the add event, so the cart
  is fresh.
- **Matomo "only track known URLs"**: the app url is the Shopgate CDN host, not the shop
  domain, so hits are silently discarded (204). Use the `siteBaseUrl` config to rewrite the
  origin.
- **Ecommerce product view** uses top-level `_pks`/`_pkn`/`_pkc`/`_pkp` params, not `_cvar`.
- **Pipeline input keys** must match in the frontend `setInput`, the pipeline `input` AND the
  step `input` — change all of them together or backend start fails `PIPELINEINVALID`.
- **`extension/config.json` + `frontend/config.json` are regenerated** from the
  extension-config defaults on every `sgconnect` start; real admin values live in the
  Developer Center.
- Consent comes from the Shopgate Consent Manager; forward both `cookieConsentInitialized$`
  (seed) and `cookieConsentSet$` (change), and **merge** (don't overwrite) server-side.

## Rules

- Follow the Shopgate Extension Review Guideline for backend steps (no state in step files,
  use `context.log` not `console`, throw errors don't return them, return `{}` not `null`,
  no core-pipeline overrides, no hardcoded secrets).
