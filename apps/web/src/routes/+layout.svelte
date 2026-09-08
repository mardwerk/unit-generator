<script lang="ts">
  import '@mardwerk/ui/styles.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}

<style>
  :global(html),
  :global(body) {
    min-width: 20rem;
    min-height: 100%;
    margin: 0;
  }

  :global(body) {
    background: var(--mw-color-canvas);
  }
</style>
