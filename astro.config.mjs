import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/static';

export default defineConfig({
  site: 'https://familyfriendlyuk.co.uk',
  integrations: [react()],
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true }
  }),
});
