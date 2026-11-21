<script setup lang="ts">
import MasteryBar from '@/components/MasteryBar.vue'
import { classRows, commonBugs, needsYou, skills, week, type ClassRow } from '@/lib/mock'

const maxBug = Math.max(...commonBugs.map((b) => b.children))

const FOCUS: Record<ClassRow['focus']['kind'], string> = {
  fixed: 'inline-block rounded-full bg-pen-soft px-2.5 py-[3px] text-[13px] font-bold text-pen-deep',
  needs: 'inline-block rounded-full bg-marker px-2.5 py-[3px] text-[13px] font-bold text-white',
  watching: 'inline-block rounded-full border-[1.5px] border-marker px-2 py-0.5 text-[13px] font-bold text-marker-ink',
  none: 'text-ink-2',
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-4 pb-12 pt-9 sm:px-8">
    <section aria-label="This week" class="flex max-w-[900px] flex-col gap-3.5">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-4xl font-bold leading-tight tracking-[-0.01em]">Group A this week</h1>
        <span class="rounded-full bg-marker-soft px-2.5 py-1 text-[13px] font-bold text-marker-ink">Sample data</span>
      </div>
      <p class="text-[22px] leading-normal">
        {{ week.children }} children practised for <b>{{ week.time }}</b>. Glimpse found <b>{{ week.found }} misconceptions</b> and <b>{{ week.fixed }} are already fixed</b>. Two children need you:
        <RouterLink :to="{ name: 'student', params: { id: 'noor' } }" class="font-bold">Noor</RouterLink> and
        <RouterLink :to="{ name: 'student', params: { id: 'mariam' } }" class="font-bold">Mariam</RouterLink>.
      </p>
    </section>

    <div class="flex flex-wrap items-start gap-6">
      <section aria-label="Children" class="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5 rounded-md border border-line bg-paper px-6 py-[22px]">
        <h2 class="text-xl font-bold">Children</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] border-collapse text-[15px]">
            <thead>
              <tr class="text-left text-[13px] text-ink-2">
                <th scope="col" class="pb-2.5 pr-2.5 pt-2 font-bold">Child</th>
                <th v-for="s in skills" :key="s.id" scope="col" class="px-2.5 pb-2.5 pt-2 font-bold">{{ s.short }}</th>
                <th scope="col" class="px-2.5 pb-2.5 pt-2 font-bold">Right now</th>
                <th scope="col" class="pb-2.5 pl-2.5 pt-2 font-bold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in classRows" :key="row.id" class="border-t border-line-soft">
                <td class="py-3 pr-2.5">
                  <RouterLink :to="{ name: 'student', params: { id: row.id } }" class="font-bold no-underline">{{ row.name }}</RouterLink><br />
                  <span :lang="row.langCode" class="text-[13px] text-ink-2">{{ row.language }}</span>
                </td>
                <td v-for="s in skills" :key="s.id" class="px-2.5 py-3"><MasteryBar :value="row.mastery[s.id]" /></td>
                <td class="px-2.5 py-3"><span :class="FOCUS[row.focus.kind]">{{ row.focus.text }}</span></td>
                <td class="py-3 pl-2.5 text-ink-2">{{ row.lastSeen }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-[13px] text-ink-2">Numbers are the chance the child has mastered the skill. Bold blue means 95 or more: mastered.</p>
      </section>

      <div class="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
        <section aria-label="Needs you this week" class="flex flex-col gap-4 rounded-md border-2 border-marker bg-paper px-6 py-[22px]">
          <h2 class="text-xl font-bold">Needs you this week</h2>
          <div v-for="n in needsYou" :key="n.id" class="flex flex-col gap-1">
            <RouterLink :to="{ name: 'student', params: { id: n.id } }" class="text-[17px] font-bold no-underline">{{ n.name }}</RouterLink>
            <span class="text-[15px] leading-normal">{{ n.text }}</span>
          </div>
        </section>

        <section aria-label="Most common this week" class="flex flex-col gap-4 rounded-md border border-line bg-paper px-6 py-[22px]">
          <h2 class="text-xl font-bold">Most common this week</h2>
          <div v-for="(b, i) in commonBugs" :key="b.name" class="flex flex-col gap-1.5">
            <span class="flex justify-between gap-3 text-[15px]"><span>{{ b.name }}</span><b>{{ i === 0 ? `${b.children} children` : b.children }}</b></span>
            <span class="h-2.5 overflow-hidden rounded-[5px] bg-marker-pale"><span class="block h-full bg-marker" :style="{ width: `${(b.children / maxBug) * 100}%` }" /></span>
          </div>
          <RouterLink :to="{ name: 'library' }" class="text-[15px] font-bold">Open the misconception library</RouterLink>
        </section>
      </div>
    </div>
  </main>
</template>
