<script setup lang="ts">
import { computed } from 'vue'
import MasteryBar from '@/components/MasteryBar.vue'
import { classRows, details, MASTERED, skills } from '@/lib/mock'

const props = defineProps<{ id: string }>()

const row = computed(() => classRows.find((r) => r.id === props.id))
const detail = computed(() => details[props.id])

const STATUS = {
  fixed: { text: 'Fixed', cls: 'bg-pen-soft text-pen-deep px-2.5 py-[3px]' },
  watching: { text: 'Watching', cls: 'border-[1.5px] border-marker text-marker-ink px-2 py-0.5' },
  needs: { text: 'Needs you', cls: 'bg-marker text-white px-2.5 py-[3px]' },
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-7 px-4 pb-12 pt-6 sm:px-8">
    <nav aria-label="Breadcrumb" class="text-[15px]">
      <RouterLink :to="{ name: 'class' }">Group A</RouterLink><span class="text-ink-2"> / {{ row?.name ?? 'Unknown child' }}</span>
    </nav>

    <p v-if="!row" class="text-lg">No child with this name in group A. <RouterLink :to="{ name: 'class' }">Back to the class</RouterLink></p>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <span class="flex size-16 items-center justify-center rounded-full bg-pen-soft text-[28px] font-bold text-pen">{{ row.name[0] }}</span>
          <div class="flex flex-col gap-1.5">
            <h1 class="text-4xl font-bold leading-tight">{{ row.name }}</h1>
            <span class="flex flex-wrap gap-1.5">
              <span class="rounded-full border border-line bg-paper px-2.5 py-[3px] text-[13px]">Hints in {{ row.language }}</span>
              <span class="rounded-full border border-line bg-paper px-2.5 py-[3px] text-[13px]">Adding fractions</span>
              <span class="rounded-full bg-marker-soft px-2.5 py-[3px] text-[13px] font-bold text-marker-ink">Sample data</span>
            </span>
          </div>
        </div>
        <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-paper px-4 text-[15px] text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>
          Print the next worksheet
        </button>
      </div>

      <div class="flex flex-wrap items-start gap-6">
        <div class="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
          <section aria-label="Skills" class="flex flex-col gap-[18px] rounded-md border border-line bg-paper px-6 py-[22px]">
            <h2 class="text-xl font-bold">Skills</h2>
            <div v-for="s in skills" :key="s.id" class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span class="basis-[230px] text-[15px]">{{ s.long }}</span>
              <MasteryBar :value="row.mastery[s.id]" size="lg" />
              <b v-if="row.mastery[s.id] >= MASTERED" class="basis-[110px] text-[15px] text-pen-deep">{{ row.mastery[s.id] }}, mastered</b>
              <span v-else class="basis-[110px] text-[15px]">{{ row.mastery[s.id] }}</span>
            </div>
            <p class="text-[13px] text-ink-2">The black tick on each bar is {{ MASTERED }}: past it, Glimpse moves on to harder problems.</p>
          </section>

          <section aria-label="Misconceptions" class="flex flex-col gap-[22px] rounded-md border border-line bg-paper px-6 py-[22px]">
            <h2 class="text-xl font-bold">Misconceptions</h2>
            <p v-if="!detail" class="text-[15px] text-ink-2">Nothing recorded yet. Misconceptions appear here once Glimpse has reproduced one of this child's answers.</p>
            <article v-for="(m, i) in detail?.misconceptions ?? []" :key="m.name" class="flex flex-col gap-3.5" :class="i > 0 ? 'border-t border-line-soft pt-[18px]' : ''">
              <div class="flex flex-wrap items-center gap-2.5">
                <h3 class="text-lg font-bold">{{ m.name }}</h3>
                <span class="rounded-full text-[13px] font-bold" :class="STATUS[m.status].cls">{{ STATUS[m.status].text }}</span>
              </div>
              <ol v-if="m.timeline" class="m-0 flex list-none flex-col border-l-2 border-line py-0 pl-1.5 pr-0">
                <li v-for="(t, j) in m.timeline" :key="t.when" class="relative pl-[22px] text-[15px] leading-normal" :class="j < m.timeline.length - 1 ? 'pb-3.5' : ''">
                  <span class="absolute -left-2 top-[5px] size-3.5 rounded-full" :class="t.tone === 'marker' ? 'bg-marker' : 'bg-pen'" />
                  <b>{{ t.when }}.</b> {{ t.text }}
                </li>
              </ol>
              <p v-if="m.note" class="text-[15px] leading-normal">{{ m.note }}</p>
            </article>
          </section>
        </div>

        <section v-if="detail" aria-label="Sessions" class="flex min-w-0 flex-[1_1_340px] flex-col gap-3 rounded-md border border-line bg-paper px-6 py-[22px]">
          <h2 class="text-xl font-bold">Sessions</h2>
          <table class="w-full border-collapse text-[15px]">
            <thead>
              <tr class="text-left text-[13px] text-ink-2">
                <th scope="col" class="pb-2 pr-2 font-bold">When</th>
                <th scope="col" class="px-2 pb-2 text-right font-bold">Minutes</th>
                <th scope="col" class="px-2 pb-2 text-right font-bold">Problems</th>
                <th scope="col" class="pb-2 pl-2 text-right font-bold">Hints</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in detail.sessions" :key="s.when" class="border-t border-line-soft">
                <td class="py-2.5 pr-2">{{ s.when }}</td>
                <td class="px-2 py-2.5 text-right">{{ s.minutes }}</td>
                <td class="px-2 py-2.5 text-right">{{ s.problems }}</td>
                <td class="py-2.5 pl-2 text-right">{{ s.hints }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </main>
</template>
