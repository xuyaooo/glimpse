<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { students } from '@/lib/mock'
import { selectStudent, state } from '@/lib/engine'

const router = useRouter()

function pick(id: string) {
  selectStudent(id)
  router.push({ name: 'setup' })
}

const AVATAR = { pen: 'bg-pen-soft text-pen', marker: 'bg-marker-soft text-marker-ink', plain: 'bg-mute text-ink' }

const engineLine = computed(
  () =>
    ({
      connecting: 'Starting the tutor',
      live: 'The tutor runs on this laptop',
      demo: 'Demo mode: no camera connected',
      offline: 'The tutor stopped. Restart the engine.',
    })[state.connection],
)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-squared">
    <header class="flex flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-10">
      <BrandMark />
      <RouterLink to="/teacher" class="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper px-[18px] text-[15px] text-ink no-underline">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        Teacher area
      </RouterLink>
    </header>

    <main class="mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-10 px-4 pb-12 pt-8 sm:px-6">
      <div class="flex flex-col gap-3.5">
        <h1 class="text-[40px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">Who's at the desk?</h1>
        <p class="max-w-[660px] text-xl leading-normal text-ink-2">Tap your name. Then just write on your worksheet. Glimpse watches the paper and helps when something looks off.</p>
      </div>

      <ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 p-0">
        <li v-for="s in students" :key="s.id">
          <button
            type="button"
            class="flex size-full min-h-[216px] flex-col gap-3.5 rounded-lg border border-line bg-paper p-6 text-left text-ink transition-shadow hover:border-pen hover:shadow-[inset_0_0_0_1px_var(--color-pen)]"
            @click="pick(s.id)"
          >
            <span class="flex size-16 items-center justify-center rounded-full text-[26px] font-bold" :class="AVATAR[s.tone]">{{ s.name[0] }}</span>
            <span class="text-[26px] font-bold">{{ s.name }}</span>
            <span class="flex flex-wrap gap-1.5">
              <span class="rounded-full bg-desk px-2.5 py-1 text-[13px]">{{ s.language }}</span>
              <span class="rounded-full bg-desk px-2.5 py-1 text-[13px]">{{ s.topic }}</span>
            </span>
            <span class="mt-auto text-sm text-ink-2">{{ s.lastTime }}</span>
          </button>
        </li>
        <li>
          <RouterLink to="/teacher" class="flex size-full min-h-[216px] flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed border-[#b9c0cc] p-6 text-base text-ink-2 no-underline">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add a child
          </RouterLink>
        </li>
      </ul>

      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-paper px-6 py-[18px]">
        <div class="flex flex-wrap gap-6 text-sm">
          <span class="inline-flex items-center gap-2"><span class="size-[9px] rounded-full" :class="state.connection === 'live' ? 'bg-pen' : 'bg-ink-2'" />{{ state.connection === 'live' ? 'Camera is ready' : 'Camera not connected' }}</span>
          <span class="inline-flex items-center gap-2"><span class="size-[9px] rounded-full bg-pen" />Thumb button on the mouse checks your line</span>
          <span class="inline-flex items-center gap-2"><span class="size-[9px] rounded-full" :class="state.connection === 'offline' ? 'bg-marker' : 'bg-pen'" />{{ engineLine }}</span>
        </div>
        <span class="inline-flex items-center gap-2 text-sm text-ink-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
          Video never leaves this laptop. Close the camera shutter any time.
        </span>
      </div>
    </main>
  </div>
</template>
