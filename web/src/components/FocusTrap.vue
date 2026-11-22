<script setup lang="ts">
// Keeps the keyboard inside a dialog while it is open: put it inside the dialog's v-if. Focus
// moves into the dialog (its [autofocus] control, else the dialog itself), Tab and Shift+Tab go
// round its controls, and when it closes, focus goes back to what had it before.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const root = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const dialog = () => root.value?.closest<HTMLElement>('[role="dialog"]') ?? root.value?.querySelector<HTMLElement>('[role="dialog"]') ?? null

function onKey(e: KeyboardEvent) {
  const box = dialog() ?? root.value
  if (e.key !== 'Tab' || !box || e.defaultPrevented) return
  // another dialog, on top of this one, has the focus: it keeps it
  const active = document.activeElement
  if (active instanceof HTMLElement && !box.contains(active) && active.closest('[role="dialog"]')) return
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (!items.length) return void e.preventDefault()
  const at = items.indexOf(document.activeElement as HTMLElement)
  const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at < 0 || at === items.length - 1 ? 0 : at + 1
  e.preventDefault()
  items[next].focus()
}

onMounted(async () => {
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  await nextTick()
  const target = root.value?.querySelector<HTMLElement>('[autofocus]') ?? dialog()
  target?.focus({ preventScroll: true })
  window.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  if (opener?.isConnected) opener.focus({ preventScroll: true })
})
</script>

<template>
  <div ref="root" class="contents"><slot /></div>
</template>
