<script setup lang="ts">
import Mascot from './Mascot.vue'

withDefaults(
  defineProps<{ title?: string; subtitle?: string; avatar?: string; bell?: number; search?: string; searchLabel?: string; sun?: boolean }>(),
  { title: '', subtitle: '', avatar: '', bell: 0, search: undefined, searchLabel: 'Search your exercises', sun: true },
)
defineEmits<{ 'update:search': [value: string]; bell: []; avatar: [] }>()
</script>

<template>
  <header class="stagger flex flex-wrap items-center gap-x-6 gap-y-3 pb-5" style="--d: 0ms">
    <div v-if="title" class="flex min-w-0 flex-1 items-center gap-4">
      <Mascot :size="78" wave />
      <div class="min-w-0">
        <h1 class="flex items-center gap-3 text-[28px] font-black leading-tight tracking-[-0.015em] sm:text-[32px]">
          {{ title }}
          <svg v-if="sun" class="shrink-0 animate-sun" width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
            <g stroke="#FFC93C" stroke-width="3.2" stroke-linecap="round">
              <path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5 32 32M8 32l3.5-3.5M28.5 11.5 32 8" />
            </g>
            <circle cx="20" cy="20" r="8" fill="#FFC93C" />
          </svg>
        </h1>
        <p class="text-[17px] font-semibold text-ink-2">{{ subtitle }}</p>
      </div>
    </div>

    <div class="flex items-center gap-3" :class="title ? 'max-sm:w-full' : 'ml-auto max-sm:w-full'">
      <label v-if="search !== undefined" class="flex h-12 w-[260px] min-w-0 max-w-full items-center max-sm:flex-1 gap-2.5 rounded-full border border-white bg-white/80 px-4 shadow-[0_8px_20px_-14px_rgb(24_41_74/0.4)] transition-shadow focus-within:shadow-[0_0_0_3px_var(--color-lagoon-soft)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b84" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span class="sr-only">{{ searchLabel }}</span>
        <input
          :value="search"
          type="search"
          :placeholder="`${searchLabel}…`"
          class="w-full bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-ink-3"
          @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button
        v-if="bell >= 0"
        type="button"
        :aria-label="bell ? `${bell} new exercises to try` : 'No new exercises'"
        class="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-14px_rgb(24_41_74/0.4)] transition-transform hover:-rotate-12 active:scale-95"
        @click="$emit('bell')"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#18294A" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6zm-2.5 15a2.5 2.5 0 0 0 5 0z" /></svg>
        <span v-if="bell" :key="bell" class="absolute -right-0.5 -top-0.5 flex size-5 animate-pop items-center justify-center rounded-full bg-tangerine text-[11px] font-black text-white">{{ bell }}</span>
      </button>
      <button
        v-if="avatar"
        type="button"
        aria-label="Change who's writing"
        class="flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-black text-white shadow-[0_8px_20px_-10px_rgb(15_127_118/0.8)] ring-4 ring-white transition-transform hover:scale-105 active:scale-95"
        style="background: linear-gradient(160deg, #18a99c, #0b6962)"
        @click="$emit('avatar')"
      >{{ avatar }}</button>
    </div>
  </header>
</template>
