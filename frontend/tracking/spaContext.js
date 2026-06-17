let previousUrl = '';

/**
 * Reads the current SPA location/title from the webview.
 * The frontend (unlike the backend Matomo call) DOES have a window context, so it
 * captures url / urlref / title here and forwards them through the pipeline. This is
 * what makes Matomo SPA tracking work (see developer.matomo.org/guides/spa-tracking):
 * matomo.php has no browser context, so `url` and `urlref` must be sent explicitly.
 * @param {string} [title] An optional, nicer page title (e.g. from the pageview payload).
 * @returns {{url: string, urlref: string, title: string}}
 */
export function getPageContext(title) {
  const url = (typeof window !== 'undefined' && window.location && window.location.href) || '';
  const docTitle = (typeof document !== 'undefined' && document.title) || '';
  return {
    url,
    urlref: previousUrl,
    title: title || docTitle,
  };
}

/**
 * Advances the SPA referrer chain. Call this once per virtual pageview AFTER reading
 * the context, so the next pageview reports this page as its referrer.
 */
export function advancePage() {
  if (typeof window !== 'undefined' && window.location && window.location.href) {
    previousUrl = window.location.href;
  }
}
