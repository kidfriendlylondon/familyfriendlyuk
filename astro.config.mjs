import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://familyfriendlyuk.co.uk',
  integrations: [react()],
  output: 'static',
});
