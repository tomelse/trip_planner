<script lang="ts">
  import { store } from '../lib/store.svelte'
</script>

{#if store.toast}
  <div class="toast" role="status">
    <span>{store.toast.message}</span>
    {#if store.toast.undo}<button onclick={() => store.undo()}>{store.toast.label}</button>{/if}
  </div>
{/if}

<style>
  .toast {
    position: fixed; z-index: 3000; left: 50%; transform: translateX(-50%);
    bottom: calc(16px + env(safe-area-inset-bottom));
    display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 24px);
    padding: 8px 8px 8px 14px; background: var(--ink); color: var(--bg); border-radius: var(--radius);
  }
  button { border: none; color: var(--bg); font-weight: 600; text-decoration: underline; padding: 4px 8px; }
  button:hover { background: none; opacity: 0.8; }
</style>
