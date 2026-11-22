<script setup lang="ts">
// Tutor view: a summary per student. What they wrote, what went wrong and whether it got
// fixed, which teaching style works for them, what to practise next.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import MathTex from '@/components/MathTex.vue'
import ProgressRing from '@/components/ProgressRing.vue'
import TopBar from '@/components/TopBar.vue'
import { state } from '@/lib/engine'
import { STYLE_LABEL, type StudentSummary } from '@/lib/mock'
import { localSummaries } from '@/lib/records'
import { useCountUp } from '@/lib/useCountUp'
import type { TeachStyle } from '@/lib/types'

const props = defineProps<{ id?: string }>()

const list = ref<StudentSummary[]>(localSummaries())

async function load() {
  if (state.connection !== 'live') {
    list.value = localSummaries()
    return
  }
  try {
    const res = await fetch('/api/students')
    if (res.ok) list.value = await res.json()
  } catch {
    // keep what we have
  }
}
onMounted(load)
watch(() => state.connection, load)

const current = computed(() => list.value.find((s) => s.id === props.id) ?? list.value[0])
// Today's totals, not just the lines listed (sample summaries list only a few).
const accuracy = computed(() => (current.value?.today.parts ? current.value.today.right / current.value.today.parts : null))

const linesShown = useCountUp(() => current.value?.today.parts ?? 0)
const rightShown = useCountUp(() => current.value?.today.right ?? 0)
const minutesShown = useCountUp(() => current.value?.today.minutes ?? 0)

const styles = computed(() =>
  (Object.entries(current.value?.profile ?? {}) as [TeachStyle, { tries: number; wins: number }][])
    .map(([style, v]) => ({ style, ...v, rate: v.tries ? v.wins / v.tries : 0 }))
    .sort((a, b) => b.rate - a.rate || b.tries - a.tries),
)

const AVATAR = ['linear-gradient(160deg,#18a99c,#0b6962)', 'linear-gradient(160deg,#ff9b54,#e2601a)', 'linear-gradient(160deg,#a68bff,#6d4bdf)', 'linear-gradient(160deg,#5b8def,#1f5fd6)']
</script>

<template>
  <AppShell>
    <TopBar title="Tutor view" subtitle="How each child is doing, and what to practise next." :sun="false" :bell="-1" />

    <div class="grid items-start gap-5 lg:grid-cols-[290px_1fr]">
      <nav aria-label="Students" class="card stagger flex flex-col gap-1.5 p-3" style="--d: 80ms">
        <h2 class="px-2 pb-1 pt-1.5 text-[15px] font-black text-ink-2">Students</h2>
        <RouterLink
          v-for="(s, i) in list"
          :key="s.id"
          :to="{ name: 'dashboard', params: { id: s.id } }"
          :aria-current="s.id === current?.id ? 'page' : undefined"
          class="group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 text-ink no-underline transition-all duration-300"
          :class="s.id === current?.id ? 'bg-lagoon-mist shadow-[inset_0_0_0_2px_var(--color-lagoon-soft)]' : 'hover:translate-x-1 hover:bg-line-2'"
        >
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-black text-white transition-transform group-hover:scale-105" :style="{ background: AVATAR[i % AVATAR.length] }">{{ s.name[0] }}</span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="font-black">{{ s.name }}</span>
            <span class="truncate text-[13px] font-semibold text-ink-2">{{ s.today.parts ? `${s.today.right} of ${s.today.parts} right today` : 'No session today' }}</span>
          </span>
          <span v-if="s.live" class="shrink-0 rounded-full bg-lagoon px-2 py-0.5 text-[12px] font-black text-white">Now</span>
          <span v-else-if="s.flag === 'needs'" class="flex shrink-0 items-center gap-1 rounded-full bg-wrong-bg px-2 py-0.5 text-[12px] font-black text-wrong">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l10 18H2z" /></svg>Needs you
          </span>
        </RouterLink>
      </nav>

      <div v-if="current" :key="current.id" class="flex min-w-0 flex-col gap-5">
        <section aria-label="Summary" class="card stagger relative overflow-hidden p-5 sm:p-6" style="--d: 140ms">
          <div class="flex flex-wrap items-start gap-6">
            <div class="flex min-w-[260px] flex-1 flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2.5">
                <h2 class="text-[30px] font-black leading-tight">{{ current.name }}</h2>
                <span class="rounded-full bg-line-2 px-3 py-1 text-[13px] font-bold text-ink-2">Hints in {{ current.language }}</span>
                <span v-if="current.live" class="rounded-full bg-lagoon px-3 py-1 text-[13px] font-black text-white">This session</span>
                <span v-if="current.sample" class="rounded-full bg-[#fff4d6] px-3 py-1 text-[13px] font-black text-[#7a4f00]">Sample data</span>
              </div>
              <p class="max-w-[720px] text-[19px] font-semibold leading-relaxed">{{ current.headline }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-4">
              <ProgressRing :value="accuracy" label="Right today" :size="124" />
              <div class="grid grid-cols-3 gap-2.5">
                <div class="flex flex-col items-center rounded-2xl bg-lagoon-mist px-3 py-3">
                  <span class="text-[26px] font-black tabular-nums">{{ linesShown }}</span><span class="text-[13px] font-bold text-ink-2">Lines</span>
                </div>
                <div class="flex flex-col items-center rounded-2xl bg-right-bg px-3 py-3">
                  <span class="text-[26px] font-black tabular-nums">{{ rightShown }}</span><span class="text-[13px] font-bold text-ink-2">Right</span>
                </div>
                <div class="flex flex-col items-center rounded-2xl bg-marker-soft px-3 py-3">
                  <span class="text-[26px] font-black tabular-nums">{{ minutesShown }}</span><span class="text-[13px] font-bold text-ink-2">Minutes</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <section aria-label="What they wrote" class="card stagger flex min-w-0 flex-col gap-2 p-5 sm:p-6" style="--d: 220ms">
            <h3 class="text-xl font-black">What {{ current.name }} wrote</h3>
            <p v-if="!current.parts.length" class="text-[15px] font-semibold text-ink-2">Nothing written yet today.</p>
            <ol class="m-0 flex list-none flex-col p-0">
              <li v-for="(p, i) in current.parts" :key="i" class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0" :style="{ animation: `rise 500ms ${300 + i * 70}ms both` }">
                <span class="w-12 text-[13px] font-bold tabular-nums text-ink-3">{{ p.time }}</span>
                <MathTex :latex="p.latex" class="text-[20px]" />
                <span v-if="p.verdict === 'correct'" class="ml-auto inline-flex items-center gap-1 rounded-full bg-right-bg px-2.5 py-0.5 text-[13px] font-black text-right">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>Right
                </span>
                <span v-else-if="p.verdict === 'wrong'" class="ml-auto inline-flex items-center gap-1 rounded-full bg-wrong-bg px-2.5 py-0.5 text-[13px] font-black text-wrong">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>{{ p.note ?? 'Not yet' }}
                </span>
                <span v-else class="ml-auto rounded-full bg-line-2 px-2.5 py-0.5 text-[13px] font-black text-ink-2">Not checked</span>
              </li>
            </ol>
          </section>

          <section aria-label="What teaching works" class="card stagger flex min-w-0 flex-col gap-4 p-5 sm:p-6" style="--d: 280ms">
            <h3 class="text-xl font-black">What works for {{ current.name }}</h3>
            <p v-if="!styles.length" class="text-[15px] font-semibold text-ink-2">No explanations needed yet. Each explanation followed by a right answer counts here.</p>
            <div v-for="s in styles" :key="s.style" class="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-[15px]">
              <span class="font-bold">{{ STYLE_LABEL[s.style] }}</span>
              <span class="h-2.5 overflow-hidden rounded-full bg-lagoon-soft" :title="`${s.wins} of ${s.tries} times the next exercise was right`">
                <span class="block h-full rounded-full bg-lagoon" :style="{ width: `${s.rate * 100}%`, animation: 'write-on 900ms ease-out 400ms backwards' }" />
              </span>
              <span class="font-bold tabular-nums text-ink-2">{{ s.wins }} of {{ s.tries }}</span>
            </div>
            <p class="text-[13px] font-semibold text-ink-2">Glimpse picks the next explanation from this, and never repeats one that just didn't work.</p>
          </section>
        </div>

        <div class="grid gap-5 xl:grid-cols-3">
          <section aria-label="Misconceptions" class="card stagger flex min-w-0 flex-col gap-3 p-5" style="--d: 340ms">
            <h3 class="text-lg font-black">Misconceptions</h3>
            <p v-if="!current.misconceptions.length" class="text-[15px] font-semibold text-ink-2">None found.</p>
            <div v-for="m in current.misconceptions" :key="m.id" class="flex flex-col gap-1.5 rounded-2xl bg-line-2/60 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-black">{{ m.name.charAt(0).toUpperCase() + m.name.slice(1) }}</span>
                <span class="rounded-full px-2.5 py-0.5 text-[12px] font-black" :class="m.status === 'fixed' ? 'bg-right-bg text-right' : 'bg-[#fff4d6] text-[#7a4f00]'">{{ m.status === 'fixed' ? 'Fixed' : 'Working on it' }}</span>
              </div>
              <span class="text-[14px] font-semibold text-ink-2">Seen {{ m.seen === 1 ? 'once' : `${m.seen} times` }}. Taught with {{ m.styles.map((s) => STYLE_LABEL[s].toLowerCase()).join(', then ') }}.</span>
            </div>
          </section>

          <section aria-label="Practise next" class="card stagger flex min-w-0 flex-col gap-3 p-5" style="--d: 400ms">
            <h3 class="text-lg font-black">Practise next</h3>
            <p v-if="!current.next.length" class="text-[15px] font-semibold text-ink-2">Nothing queued.</p>
            <div class="flex flex-wrap gap-2.5">
              <span v-for="e in current.next" :key="e" class="rounded-2xl border border-line bg-white px-3.5 py-2.5 transition-transform hover:-translate-y-0.5"><MathTex :latex="`${e}=`" class="text-[19px]" /></span>
            </div>
          </section>

          <section aria-label="AI usage" class="card stagger flex min-w-0 flex-col gap-2 p-5" style="--d: 460ms">
            <h3 class="text-lg font-black">AI usage today</h3>
            <p class="text-[15px] leading-relaxed">
              <b>{{ current.ai.localReads }}</b> {{ current.ai.localReads === 1 ? 'line' : 'lines' }} read on this laptop, <b>{{ current.ai.bigCalls }}</b> sent to a big model, costing <b>${{ current.ai.cost.toFixed(4) }}</b>.
            </p>
            <p class="text-[13px] font-semibold text-ink-2">Only a cropped line is ever sent, and only when neither the local reader nor the child's confirmation could settle it.</p>
          </section>
        </div>

        <section v-if="current.questions.length" aria-label="Questions asked" class="card stagger flex flex-col gap-3 p-5 sm:p-6" style="--d: 520ms">
          <h3 class="text-lg font-black">Questions {{ current.name }} asked</h3>
          <div v-for="(q, i) in current.questions" :key="i" class="flex flex-col gap-1 rounded-2xl p-3.5" style="background: linear-gradient(130deg, #efeaff, #f6f3ff 60%, #eaf1ff)">
            <span class="flex flex-wrap items-center gap-2 text-[16px]">
              <b :lang="q.lang">« {{ q.text }} »</b>
              <template v-if="q.about"><span class="font-semibold text-ink-2">pointing at</span><MathTex :latex="q.about" class="text-[17px]" /></template>
            </span>
            <span class="text-[14px] font-semibold text-ink-2">Answer: {{ q.answer }}</span>
          </div>
        </section>

        <section v-if="current.sessions.length" aria-label="Sessions" class="card stagger flex flex-col gap-2 p-5 sm:p-6" style="--d: 580ms">
          <h3 class="text-lg font-black">Sessions</h3>
          <table class="w-full border-collapse text-[15px]">
            <thead>
              <tr class="text-left text-[13px] text-ink-2">
                <th scope="col" class="pb-2 pr-2 font-black">When</th>
                <th scope="col" class="px-2 pb-2 text-right font-black">Minutes</th>
                <th scope="col" class="px-2 pb-2 text-right font-black">Lines</th>
                <th scope="col" class="pb-2 pl-2 text-right font-black">Right</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in current.sessions" :key="s.when" class="border-t border-line-2">
                <td class="py-2 pr-2 font-bold">{{ s.when }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ s.minutes }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ s.parts }}</td>
                <td class="py-2 pl-2 text-right tabular-nums">{{ s.right }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </AppShell>
</template>
