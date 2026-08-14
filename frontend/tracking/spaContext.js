let previousUrl = '';
let currentUrl = '';

/**
 * Reads the current SPA location/title from the webview and derives the referrer.
 * The frontend (unlike the backend Matomo call) DOES have a window context, so it
 * captures url / urlref / title here and forwards them through the pipeline. This is
 * what makes Matomo SPA tracking work (see developer.matomo.org/guides/spa-tracking):
 * matomo.php has no browser context, so `url` and `urlref` must be sent explicitly.
 *
 * The referrer chain advances lazily here: urlref is the previous DISTINCT page url.
 * Multiple events on the same page (e.g. pageview + viewContent on a PDP) therefore
 * share the same urlref — the real previous page — instead of one event referring to
 * itself.
 * @param {string} [title] An optional, nicer page title (e.g. from the pageview payload).
 * @returns {{url: string, urlref: string, title: string}}
 */
export function getPageContext(title) {
  const url = (typeof window !== 'undefined' && window.location && window.location.href) || '';
  if (url && url !== currentUrl) {
    previousUrl = currentUrl;
    currentUrl = url;
  }
  const docTitle = (typeof document !== 'undefined' && document.title) || '';
  return {
    url,
    urlref: previousUrl,
    title: title || docTitle,
  };
}
