import { store } from './store.svelte'
import type { Ref } from './focus.svelte'

/**
 * `use:hoverable={ref}` makes an element light up `ref` everywhere while it is hovered or keyboard-focused.
 * Touch is ignored: a tap would otherwise leave the highlight stuck until you tap elsewhere.
 */
export function hoverable(node: HTMLElement, ref: Ref) {
  let current = ref
  const enter = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return
    store.focus.hoverRef(current)
  }
  const leave = () => store.focus.unhoverRef(current)
  const focusIn = (e: Event) => {
    if ((e.target as HTMLElement).matches(':focus-visible')) store.focus.hoverRef(current)
  }

  node.addEventListener('pointerenter', enter)
  node.addEventListener('pointerleave', leave)
  node.addEventListener('focusin', focusIn)
  node.addEventListener('focusout', leave)

  return {
    update(next: Ref) {
      if (next.type !== current.type || next.id !== current.id) {
        leave()
        current = next
      }
    },
    destroy() {
      leave()
      node.removeEventListener('pointerenter', enter)
      node.removeEventListener('pointerleave', leave)
      node.removeEventListener('focusin', focusIn)
      node.removeEventListener('focusout', leave)
    },
  }
}

/** Scroll the row with this id into view inside `list`. */
export function revealRow(list: HTMLElement | undefined, id: number | null) {
  if (id !== null) list?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}
