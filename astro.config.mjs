import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({ site: 'https://clarkcant.cc', output: 'server', session:false, adapter: cloudflare({imageService:'passthrough'}), server: { host: '127.0.0.1', port: 4322 }, vite: { server: { strictPort: true } } });
