<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'

const route = useRoute()

const NAV = [
  { to: { name: 'class' }, label: 'Class', match: ['class', 'student'] },
  { to: { name: 'library' }, label: 'Misconceptions', match: ['library'] },
  { to: { name: 'system' }, label: 'System and cost', match: ['system'] },
]

const active = computed(() => String(route.name ?? ''))
</script>

<template>
  <div class="flex min-h-screen flex-col bg-desk">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-paper px-4 py-3 sm:px-8">
      <div class="flex flex-wrap items-center gap-7">
        <span class="flex items-center gap-2.5">
          <BrandMark :size="26" />
          <span class="text-[15px] text-ink-2">for teachers</span>
        </span>
        <nav aria-label="Teacher area" class="flex flex-wrap gap-1">
          <RouterLink
            v-for="item in NAV"
            :key="item.label"
            :to="item.to"
            :aria-current="item.match.includes(active) ? 'page' : undefined"
            class="inline-flex min-h-10 items-center rounded-[10px] px-3.5 text-[15px] no-underline"
            :class="item.match.includes(active) ? 'bg-pen-soft font-bold text-pen-deep' : 'text-ink hover:bg-desk'"
          >{{ item.label }}</RouterLink>
        </nav>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <select aria-label="Group" class="min-h-10 rounded-[10px] border border-line bg-paper px-2.5 text-[15px] text-ink">
          <option>Maths club, group A</option>
          <option>Maths club, group B</option>
        </select>
        <RouterLink to="/" class="inline-flex min-h-10 items-center rounded-[10px] border border-line px-3.5 text-[15px] text-ink no-underline">Back to the desk</RouterLink>
      </div>
    </header>
    <RouterView />
  </div>
</template>
