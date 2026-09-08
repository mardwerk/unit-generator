import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  envDir: '../..',
  ssr: {
    noExternal: ['@lucide/svelte', '@mardwerk/ui'],
    external: ['@mardwerk/unit-core', '@mardwerk/unit-definitions', '@mardwerk/unit-providers']
  },
  resolve: { dedupe: ['svelte'] }
});
