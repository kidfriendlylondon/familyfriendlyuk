import type { APIRoute } from 'astro';
import { restaurants, getAreaStats } from '../data/restaurants';

export const GET: APIRoute = () => {
  const base = 'https://familyfriendlyuk.co.uk';
  const today = new Date().toISOString().split('T')[0];
  const areaStats = getAreaStats();

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/regions', priority: '0.9', changefreq: 'weekly' },
    { url: '/suggest', priority: '0.6', changefreq: 'monthly' },
    { url: '/get-featured', priority: '0.6', changefreq: 'monthly' },
  ];

  const areaPages = Object.keys(areaStats).map(slug => ({
    url: `/area/${slug}`,
    priority: '0.8',
    changefreq: 'weekly',
  }));

  const restaurantPages = restaurants.map(r => ({
    url: `/restaurants/${r.slug}`,
    priority: '0.7',
    changefreq: 'monthly',
  }));

  const allPages = [...staticPages, ...areaPages, ...restaurantPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${base}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=86400',
    },
  });
};
