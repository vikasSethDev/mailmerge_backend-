/**
 * Rewrites a rendered email's HTML so opens and clicks can be measured:
 *  - Appends a 1x1 tracking pixel that hits /track/open/:emailJobId when the
 *    recipient's mail client loads remote images.
 *  - Rewrites every http(s) <a href> so it first hits
 *    /track/click/:emailJobId?u=<original URL>, which logs the click and then
 *    302-redirects the recipient on to the real destination.
 *
 * This is regex-based rather than a full HTML parser — good enough for the
 * simple, mostly-flat HTML this module's composer produces (see
 * rich-text-editor). Swap in a proper HTML parser (e.g. `cheerio`) if you
 * later support arbitrarily complex pasted HTML.
 */

const HREF_PATTERN = /href\s*=\s*("|')(https?:\/\/[^"']+)\1/gi;

export function rewriteLinksForClickTracking(html: string, trackingBaseUrl: string, emailJobId: string): string {
  return html.replace(HREF_PATTERN, (_match, quote: string, originalUrl: string) => {
    const trackedUrl = `${trackingBaseUrl}/api/mailmerge/track/click/${emailJobId}?u=${encodeURIComponent(
      originalUrl,
    )}`;
    return `href=${quote}${trackedUrl}${quote}`;
  });
}

export function appendOpenTrackingPixel(html: string, trackingBaseUrl: string, emailJobId: string): string {
  const pixelUrl = `${trackingBaseUrl}/api/mailmerge/track/open/${emailJobId}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" border="0" />`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixelTag}</body>`);
  }
  return `${html}${pixelTag}`;
}

/** Applies both link-click rewriting and open-pixel injection to a rendered email body. */
export function injectTracking(html: string, trackingBaseUrl: string, emailJobId: string): string {
  const withTrackedLinks = rewriteLinksForClickTracking(html, trackingBaseUrl, emailJobId);
  return appendOpenTrackingPixel(withTrackedLinks, trackingBaseUrl, emailJobId);
}
