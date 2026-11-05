<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmt } from '../lib/dates'
  import ChecklistEditor from './ChecklistEditor.svelte'
  import AttachmentList from './AttachmentList.svelte'

  const notes = $derived(store.current?.notes ?? [])
</script>

<section class="block"><ChecklistEditor title="Trip checklist" /></section>
<section class="block"><AttachmentList /></section>

<div class="bar"><button onclick={() => store.addNote()}>+ New note</button></div>

{#if notes.length === 0}
  <p class="empty">Packing lists, bookings, reminders — anything about the trip as a whole.</p>
{/if}

{#each notes as n (n.id)}
  <article>
    <div class="top">
      <input class="title" placeholder="Title" value={n.title} oninput={(e) => store.patchNote(n.id, { title: e.currentTarget.value })} />
      <button class="ghost danger" onclick={() => store.deleteNote(n.id)} aria-label="Delete note">Delete</button>
    </div>
    <textarea rows="5" placeholder="Write something…" value={n.body} oninput={(e) => store.patchNote(n.id, { body: e.currentTarget.value })}></textarea>
    <time>{fmt(n.updated_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}</time>
  </article>
{/each}

<style>
  .block { padding: 12px; border-bottom: 1px solid var(--line); }
  .bar { padding: 12px; }
  article { padding: 12px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
  .top { display: flex; gap: 6px; align-items: center; }
  .title { border-color: transparent; font-weight: 600; padding-left: 0; }
  textarea { min-height: 90px; }
  time { color: var(--ink-3); font-size: 12px; }
  .empty { padding: 0 12px 12px; margin: 0; color: var(--ink-2); }
</style>
