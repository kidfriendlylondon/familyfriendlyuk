import type { APIRoute } from 'astro';
import { restaurants } from '../data/restaurants';

// Long-tail restaurant URLs are SSR (prerender = false on the [slug]
// route) so the @astrojs/sitemap integration can't auto-discover them.
// We emit them ourselves here as a separate sitemap file; robots.txt
// references this URL alongside the integration's /sitemap-index.xml.
//
// Pre-render this endpoint statically — there are ~35,500 URLs and
// re-rendering on every crawl would be wasteful.
export const prerender = true;

const SITE_URL = 'https://familyfriendlyuk.co.uk';

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0];
  const urls = restaurants
    .map(r => `  <url>
    <loc>${SITE_URL}/restaurants/${r.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      // Cache at the edge for a day; long-tail data doesn't change often.
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
