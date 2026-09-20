/**
 * Search-engine plumbing shared by every route's head().
 *
 * One URL per page: the interface language is a client-side preference, not a
 * path segment, and the server always renders English (`?lang=` only takes
 * effect after hydration). So there are no hreflang alternates — they would
 * point crawlers at 16 URLs that all serve the same English HTML — and every
 * `?lang=xx` variant is folded into the clean URL by the canonical link below.
 */

/** The one host Google should index. The www host serves the same site, so
 * canonical links (plus the www → apex redirect in nginx) keep them from
 * competing as duplicates. */
export const SITE_URL = "https://lingoraenglishai.com";
export const SITE_NAME = "Lingora English";

/** 1200×630 social card — see public/og-image.png. */
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

export function canonicalLink(path: string) {
  return { rel: "canonical", href: `${SITE_URL}${path}` };
}

/** For pages behind a login or with no search value (sign-in, dashboard,
 * account, checkout return pages, callbacks…). Deliberately a meta tag rather
 * than a robots.txt Disallow: Google can only honour noindex on a page it is
 * allowed to fetch. */
export const NOINDEX_META = { name: "robots", content: "noindex, nofollow" } as const;
