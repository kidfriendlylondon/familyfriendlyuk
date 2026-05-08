import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel/serverless';

const SITE_URL = 'https://familyfriendlyuk.co.uk';

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
  site: SITE_URL,
  integrations: [
    react(),
    // Auto-generates /sitemap-index.xml and /sitemap-0.xml from every
    // pre-rendered page in dist/. The 35k+ SSR-only /restaurants/{slug}
    // pages are emitted by a separate custom endpoint at
    // /sitemap-restaurants.xml — including them via customPages here
    // forces the 50MB restaurants data file into the Vite config load
    // and OOMs the build.
    sitemap({
      // Drop data endpoints and the other sitemap files from the index.
      filter: (page) => {
        if (page.includes('/restaurants.geojson')) return false;
        if (/\/sitemap(-|\.xml)/.test(page)) return false;
        if (/\/admin(\/|$)/.test(page)) return false;
        if (/\/api\//.test(page)) return false;
        return true;
      },
      // Per-page-type priority + change frequency.
      serialize(item) {
        const path = new URL(item.url).pathname;
        if (path === '/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        } else if (path === '/regions') {
          item.priority = 0.9;
          item.changefreq = 'weekly';
        } else if (path.startsWith('/area/')) {
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (path === '/about') {
          item.priority = 0.6;
          item.changefreq = 'yearly';
        } else if (path === '/suggest' || path === '/get-featured') {
          item.priority = 0.6;
          item.changefreq = 'monthly';
        } else if (path === '/privacy' || path === '/terms') {
          item.priority = 0.3;
          item.changefreq = 'yearly';
        }
        return item;
      },
    }),
  ],
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
