<script setup lang="ts">
import Mascot from './Mascot.vue'
import { students } from '@/lib/mock'

defineProps<{ open: boolean; current?: string }>()
defineEmits<{ pick: [id: string]; close: [] }>()

const AVATAR = ['linear-gradient(160deg,#18a99c,#0b6962)', 'linear-gradient(160deg,#ff9b54,#e2601a)', 'linear-gradient(160deg,#a68bff,#6d4bdf)', 'linear-gradient(160deg,#5b8def,#1f5fd6)']
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-[#0d2230]/40 p-4 backdrop-blur-md">
        <div role="dialog" aria-modal="true" aria-labelledby="picker-title" class="modal-window card w-full max-w-[880px] p-6 text-center sm:p-9">
          <div class="flex justify-center"><Mascot :size="110" wave /></div>
          <h2 id="picker-title" class="mt-2 text-[32px] font-black tracking-[-0.015em] sm:text-[38px]">Who's writing today?</h2>
          <p class="mx-auto mt-1 max-w-[520px] text-[17px] font-semibold text-ink-2">Pick your name. Glimpse explains things in your language.</p>
          <ul class="m-0 mt-7 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-4">
            <li v-for="(s, i) in students" :key="s.id" class="stagger" :style="{ '--d': `${150 + i * 90}ms` }">
              <button
                type="button"
                class="group flex w-full flex-col items-center gap-3 rounded-3xl border-2 bg-white px-3 py-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_30px_-18px_rgb(24_41_74/0.5)]"
                :class="s.id === current ? 'border-lagoon' : 'border-line hover:border-lagoon-soft'"
                @click="$emit('pick', s.id)"
              >
                <span class="flex size-20 items-center justify-center rounded-full text-[34px] font-black text-white ring-4 ring-white transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110" :style="{ background: AVATAR[i % AVATAR.length] }">{{ s.name[0] }}</span>
                <span class="text-[21px] font-black">{{ s.name }}</span>
                <span class="rounded-full bg-line-2 px-3 py-1 text-[13px] font-bold text-ink-2">{{ s.language }}</span>
              </button>
            </li>
          </ul>
          <button v-if="current" type="button" class="mt-6 text-[15px] font-black text-marker underline decoration-2 underline-offset-4" @click="$emit('close')">Keep going as before</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
