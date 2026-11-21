<script setup lang="ts">
// Badges earned in this session. Locked ones stay grey with a padlock until they're earned.
import { computed } from 'vue'

const props = defineProps<{ right: number; fixed: boolean; bestRun: number; asked: number }>()

const badges = computed(() => [
  { id: 'first', label: 'First tick', why: 'Get a line right', got: props.right > 0, rim: '#F5A524', face: 'linear-gradient(160deg,#ffd45c,#f5a524)', icon: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8L3.5 9.7l5.9-.8z', fill: true },
  { id: 'fixed', label: 'Fixed it', why: 'Get a line right after a mistake', got: props.fixed, rim: '#6d4bdf', face: 'linear-gradient(160deg,#a68bff,#6d4bdf)', icon: 'M7.5 4h9A1.5 1.5 0 0 1 18 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18.5v-13A1.5 1.5 0 0 1 7.5 4zM8.5 6.5h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 16.5h.01M12 16.5h.01M15 16.5h.01', fill: false },
  { id: 'row', label: '3 in a row', why: 'Get three lines right in a row', got: props.bestRun >= 3, rim: '#1d9560', face: 'linear-gradient(160deg,#3cc48a,#1d9560)', icon: 'M4 17.5 5.5 8l4 4L12 6l2.5 6 4-4L20 17.5z', fill: true },
  { id: 'ask', label: 'Curious', why: 'Point at your paper and ask', got: props.asked > 0, rim: '#1F5FD6', face: 'linear-gradient(160deg,#5c97f0,#1f5fd6)', icon: 'M9.2 9a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1v.6M12 17.5h.01', fill: false },
])
const earned = computed(() => badges.value.filter((b) => b.got).length)
</script>

<template>
  <section aria-labelledby="badges-title" class="card stagger flex flex-col gap-4 p-5 sm:p-6" style="--d: 340ms">
    <div class="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#F5A524" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z" /></svg>
      <h2 id="badges-title" class="text-[19px] font-black">Your achievements</h2>
      <span class="ml-auto text-[14px] font-bold text-ink-2">{{ earned }} of {{ badges.length }}</span>
    </div>
    <ul class="m-0 grid list-none grid-cols-4 gap-2 p-0">
      <li v-for="(b, i) in badges" :key="b.id" class="flex flex-col items-center gap-1.5 text-center" :title="b.got ? b.label : `${b.label}: ${b.why}`">
        <span :key="`${b.id}-${b.got}`" class="relative block" :style="{ animation: b.got ? `pop 600ms cubic-bezier(0.3,1.6,0.5,1) ${420 + i * 90}ms both` : undefined }">
          <svg width="60" height="66" viewBox="0 0 60 66" aria-hidden="true">
            <!-- ribbon tails -->
            <path d="M18 44 L12 64 L21 59 L26 64 L30 48z" :fill="b.got ? b.rim : '#d3dbe6'" opacity="0.85" />
            <path d="M42 44 L48 64 L39 59 L34 64 L30 48z" :fill="b.got ? b.rim : '#d3dbe6'" opacity="0.85" />
            <circle cx="30" cy="28" r="25" :fill="b.got ? b.rim : '#dfe6ef'" />
          </svg>
          <span class="absolute left-[8px] top-[6px] flex size-[44px] items-center justify-center rounded-full shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)]" :style="{ background: b.got ? b.face : '#eef3f8' }">
            <svg v-if="b.got" width="24" height="24" viewBox="0 0 24 24" :fill="b.fill ? '#fff' : 'none'" stroke="#fff" :stroke-width="b.fill ? 1 : 2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="b.icon" /></svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="#a3afc0" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0 1 10 0V10h.5A1.5 1.5 0 0 1 19 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10zm2 0h6V7.5a3 3 0 0 0-6 0z" /></svg>
          </span>
        </span>
        <span class="text-[12px] font-black leading-tight" :class="b.got ? 'text-ink' : 'text-ink-3'">{{ b.label }}<span class="sr-only">{{ b.got ? ', earned' : `, locked: ${b.why}` }}</span></span>
      </li>
    </ul>
  </section>
</template>
