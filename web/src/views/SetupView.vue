<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import PaperSheet from '@/components/PaperSheet.vue'
import { DEMO_PROBLEMS } from '@/lib/demo'
import { languages, worksheets } from '@/lib/mock'
import { markButtonTested, startSession, state, VIDEO_URL } from '@/lib/engine'
import { useMouseButtons } from '@/lib/keys'
import type { CheckId } from '@/lib/types'

const router = useRouter()

const CHECKS: { id: CheckId; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'markers', label: 'Worksheet' },
  { id: 'light', label: 'Light' },
  { id: 'button', label: 'Mouse button' },
  { id: 'mic', label: 'Microphone' },
]

// Pressing the thumb button here tests it. Asking does nothing on this screen.
useMouseButtons({ check: markButtonTested, askStart: () => {}, askEnd: () => {} })

const blocking = computed(() => state.setup.camera.ok === false || state.setup.markers.ok === false)

function start() {
  startSession()
  router.push({ name: 'desk' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-squared">
    <header class="flex flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-10">
      <div class="flex items-center gap-4">
        <RouterLink to="/" aria-label="Back to start" class="inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper text-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </RouterLink>
        <BrandMark :size="26" />
      </div>
      <span class="inline-flex items-center gap-2.5 rounded-full border border-line bg-paper py-1.5 pl-1.5 pr-3.5 text-[15px]">
        <span class="flex size-8 items-center justify-center rounded-full bg-pen-soft font-bold text-pen">{{ state.student?.name[0] }}</span>
        {{ state.student?.name }}
        <span class="rounded-full bg-desk px-2 py-0.5 text-[13px]">{{ state.student?.language }}</span>
      </span>
    </header>

    <main class="mx-auto flex w-full max-w-[1320px] flex-1 flex-wrap items-start gap-7 px-4 pb-10 pt-2 sm:px-6">
      <section aria-label="What the camera sees" class="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[10px] bg-stage p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm text-[#e7eaf0]">What the camera sees</span>
          <span class="inline-flex items-center gap-2 rounded-full bg-[#1c2a52] px-3 py-1.5 text-[13px] font-bold text-[#cfdbff]">
            <span class="size-2 rounded-full bg-[#7ea2ff]" />{{ state.setup.markers.ok ? '4 / 4 markers found' : 'Looking for the corner markers' }}
          </span>
        </div>
        <img v-if="state.connection === 'live' && state.camera" :src="VIDEO_URL" alt="Live camera view of the desk" class="aspect-video w-full rounded-xl bg-table object-cover" />
        <div v-else class="flex min-h-[600px] items-center justify-center overflow-hidden rounded-xl bg-table p-6">
          <PaperSheet :problems="DEMO_PROBLEMS.slice(0, 3)" detect-markers />
        </div>
        <span class="text-[13px] text-[#a9b1bf]">Blue squares are the corner markers the camera can see. Keep all four uncovered when you start.</span>
      </section>

      <section aria-label="Checks" class="flex min-w-0 flex-[1_1_380px] flex-col gap-[22px]">
        <div class="flex flex-col gap-2">
          <h1 class="text-[38px] font-bold leading-[1.1] tracking-[-0.015em]">Let's check the desk</h1>
          <p class="text-base text-ink-2">Takes ten seconds. Do it once per session.</p>
        </div>

        <ul class="m-0 flex list-none flex-col rounded-md border-[1.5px] border-ink bg-paper p-0">
          <li
            v-for="(c, i) in CHECKS"
            :key="c.id"
            class="flex gap-3.5 px-[18px] py-4"
            :class="[i < CHECKS.length - 1 ? 'border-b border-line-soft' : '', state.setup[c.id].ok === false ? 'bg-[#fff7f0]' : '']"
          >
            <svg v-if="state.setup[c.id].ok === true" class="shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2452CC" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Done"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
            <svg v-else-if="state.setup[c.id].ok === false" class="shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C2510C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Needs attention"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></svg>
            <svg v-else class="shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4A5160" stroke-width="2.2" stroke-dasharray="3 3" role="img" aria-label="Waiting"><circle cx="12" cy="12" r="10" /></svg>
            <span class="flex flex-col gap-0.5">
              <b>{{ c.label }}</b>
              <span class="text-sm" :class="state.setup[c.id].ok === false ? 'text-marker-ink' : 'text-ink-2'">{{ state.setup[c.id].detail }}</span>
            </span>
          </li>
        </ul>

        <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend class="mb-2.5 text-sm font-bold">Worksheet</legend>
          <div class="flex flex-wrap gap-2.5">
            <label
              v-for="w in worksheets"
              :key="w.id"
              class="flex min-h-[52px] flex-[1_1_160px] items-center gap-2.5 rounded-xl px-3.5 text-[15px]"
              :class="state.worksheet === w.id ? 'border-2 border-pen bg-pen-soft font-bold' : 'border border-line bg-paper'"
            >
              <input v-model="state.worksheet" type="radio" name="sheet" :value="w.id" class="size-[18px] accent-pen" />{{ w.label }}
            </label>
          </div>
        </fieldset>

        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-bold">
            Hint language
            <select v-model="state.lang" class="min-h-12 rounded-xl border border-line bg-paper px-3 text-base font-normal text-ink">
              <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.label }}</option>
            </select>
          </label>
          <a
            v-if="state.connection === 'live'"
            :href="`/api/worksheets/${state.worksheet}.pdf`"
            target="_blank"
            class="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-paper px-4 text-[15px] text-ink no-underline"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>
            Print worksheet
          </a>
        </div>

        <button
          type="button"
          :disabled="blocking"
          class="flex min-h-[60px] items-center justify-center rounded-[14px] bg-pen text-xl font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9aa3b2]"
          @click="start"
        >
          Start writing
        </button>
      </section>
    </main>
  </div>
</template>
