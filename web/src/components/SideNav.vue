<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Mascot from './Mascot.vue'
import { state } from '@/lib/engine'
import { ui } from '@/lib/ui'

const route = useRoute()

const items = computed(() => [
  { label: 'Home', to: { name: 'home' }, active: route.name === 'home', icon: 'home' },
  { label: 'My work', to: { name: 'work' }, active: route.name === 'work', icon: 'work' },
  { label: 'History', to: { name: 'history' }, active: route.name === 'history', icon: 'history' },
  { label: 'Animations', to: { name: 'animations' }, active: route.name === 'animations', icon: 'animations' },
  { label: 'Tutor view', to: { name: 'dashboard', params: { id: state.student?.id } }, active: route.name === 'dashboard', icon: 'progress' },
])

// 10 points per right line; a new level every 50 points.
const PER_LEVEL = 50
const points = computed(() => state.parts.filter((p) => p.verdict === 'correct').length * 10)
const level = computed(() => Math.floor(points.value / PER_LEVEL) + 1)
const toNext = computed(() => (points.value % PER_LEVEL) / PER_LEVEL)
</script>

<template>
  <aside
    class="relative z-20 flex items-center gap-4 overflow-hidden px-4 py-3 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-[220px] lg:flex-col lg:items-stretch lg:gap-8 lg:px-4 lg:py-7"
    style="background: linear-gradient(180deg, #17407f 0%, #1f55a6 40%, #3a78c6 68%, #8fbde8 86%, #c6e0f6 100%)"
  >
    <RouterLink :to="{ name: 'home' }" class="flex items-center gap-2 text-white no-underline lg:flex-col lg:gap-1">
      <Mascot :size="58" />
      <span class="text-[24px] font-black tracking-[-0.01em] max-sm:hidden">Glimpse</span>
    </RouterLink>

    <!-- on a narrow screen the row scrolls sideways: every item can be reached. Over the Alps
         (a short window puts Settings where the mountains are drawn) -->
    <nav aria-label="Main" class="relative z-10 flex min-w-0 gap-1 max-lg:overflow-x-auto lg:flex-col lg:gap-2">
      <RouterLink
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        :aria-current="item.active ? 'page' : undefined"
        :aria-label="item.label"
        class="group flex min-h-12 shrink-0 items-center gap-3.5 rounded-full px-4 text-[16px] font-bold text-white no-underline transition-all duration-300 max-sm:px-3"
        :class="item.active ? 'bg-white/22 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_10px_20px_-12px_rgb(0_0_0/0.4)] lg:mr-[-4px]' : 'text-white/90 hover:translate-x-1 hover:bg-white/10'"
        :style="item.active ? { background: 'linear-gradient(90deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0.14))' } : undefined"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="shrink-0 transition-transform duration-300 group-hover:scale-110">
          <path v-if="item.icon === 'home'" d="M11.3 3.3a1 1 0 0 1 1.4 0l8 7.4a1 1 0 0 1-.7 1.7H19v7.1a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H6.5A1.5 1.5 0 0 1 5 19.5v-7.1H4a1 1 0 0 1-.7-1.7z" />
          <path v-else-if="item.icon === 'animations'" d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm6 3.5v7l6-3.5z" />
          <path v-else-if="item.icon === 'history'" d="M12 3a9 9 0 1 1-8.5 6h2.2A7 7 0 1 0 12 5V3zm-1 4h2v5.2l3.6 2.1-1 1.7L11 13.4zM2 4l4 1-1 4z" />
          <path v-else-if="item.icon === 'work'" d="M15.6 3.6a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L9.2 19.6 4 20.9l1.3-5.2zM14.2 6.4l3.4 3.4" />
          <path v-else d="M4 20V14h3.5v6zm6.2 0V9h3.5v11zm6.3 0V4H20v16z" />
        </svg>
        <span class="max-lg:hidden">{{ item.label }}</span>
      </RouterLink>
      <button type="button" class="group flex min-h-12 shrink-0 items-center gap-3.5 rounded-full px-4 text-left text-[16px] font-bold text-white/90 transition-all duration-300 hover:translate-x-1 hover:bg-white/10 max-sm:px-3" aria-label="Settings" @click="ui.settingsOpen = true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 transition-transform duration-300 group-hover:rotate-45"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
        <span class="max-lg:hidden">Settings</span>
      </button>
    </nav>

    <!-- Alps at the bottom of the sidebar, with the flag -->
    <svg class="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[360px] w-full lg:block" viewBox="0 0 240 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="#fff" opacity="0.85">
        <path d="M150 46 a8 8 0 0 1 2 -15 a10 10 0 0 1 19 -5 a9 9 0 0 1 15 5 a7 7 0 0 1 5 15z" style="animation: drift 44s ease-in-out -12s infinite alternate" />
      </g>
      <path d="M-10 250 L70 120 L120 190 L160 140 L250 250z" fill="#4c86c8" />
      <path d="M70 120 L52 150 L64 145 L72 156 L82 144 L92 152z" fill="#fff" />
      <path d="M160 140 L146 160 L156 157 L162 166 L170 156 L178 160z" fill="#eaf3fc" />
      <g transform="translate(70 120)">
        <line x1="0" y1="0" x2="0" y2="-24" stroke="#fff" stroke-width="2" stroke-linecap="round" />
        <g class="svg-center" style="transform-origin: left center; animation: flag 1.4s ease-in-out infinite alternate">
          <rect x="1" y="-24" width="17" height="14" rx="1.5" fill="#e1312f" />
          <path d="M8 -21h3v3h3v3h-3v3H8v-3H5v-3h3z" fill="#fff" />
        </g>
      </g>
      <path d="M-10 258 C40 226 100 236 140 246 C180 256 214 236 250 238 L250 360 L-10 360z" fill="#2f6fb5" />
      <g fill="#1d5a8f">
        <path d="M24 252 l-11 24 h22z M24 242 l-9 18 h18z" />
        <path d="M44 258 l-9 20 h18z" />
        <path d="M206 244 l-12 26 h24z M206 232 l-10 20 h20z" />
      </g>
      <path d="M-10 300 C60 280 130 292 250 286 L250 360 L-10 360z" fill="#1f5a9c" />
    </svg>

    <!-- Level: grows with points -->
    <div class="relative z-10 mt-auto hidden rounded-[20px] border border-white/30 bg-[#123a74]/70 p-3.5 shadow-[0_14px_24px_-14px_rgb(0_0_0/0.6)] backdrop-blur lg:block">
      <div class="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFC93C" :key="level" style="animation: pop 600ms both" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
        <span class="text-[17px] font-black">Level {{ level }}</span>
      </div>
      <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-white/25" role="progressbar" :aria-valuenow="Math.round(toNext * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Level ${level}, ${Math.round(toNext * 100)}% of the way to the next`">
        <div class="h-full rounded-full bg-sun transition-[width] duration-700" :style="{ width: `${Math.max(6, toNext * 100)}%` }" />
      </div>
    </div>
  </aside>
</template>
