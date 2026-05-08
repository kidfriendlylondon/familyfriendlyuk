import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless';

// Hybrid output: every page is static by default (homepage, /area/[city],
// /regions, /about, /privacy, /terms, /sitemap.xml, /restaurants.geojson,
// etc.) — fast static builds. Only the long-tail restaurant detail route
// opts out via `prerender = false` and is rendered on-demand at the
// edge with Vercel ISR caching.
//
// Pre-rendering 35k+ /restaurants/[slug] pages was timing out the
// build at 45 minutes; this drops the build to ~30s and serves each
// restaurant page from edge cache after the first hit.
export default defineConfig({
  site: 'https://familyfriendlyuk.co.uk',
  integrations: [react()],
  output: 'hybrid',
  adapter: vercel({
    isr: {
      // Cache each rendered restaurant page at the edge for 1 hour.
      // After expiration, the next request triggers a regeneration in
      // the background while the stale page is still served.
      expiration: 60 * 60,
    },
  }),
});
