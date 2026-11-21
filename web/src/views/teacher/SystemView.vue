<script setup lang="ts">
import { cascade, cost, escalations, latency } from '@/lib/mock'

// Log scale, or the last rows of the cascade would be invisible.
const top = Math.log10(cascade[0].count)
const width = (count: number) => `${Math.max(4, (Math.log10(Math.max(count, 1)) / top) * 100)}%`
const BAR = { grey: 'bg-[#9aa3b2]', pen: 'bg-pen', marker: 'bg-marker' }

const totalMs = latency.reduce((s, x) => s + x.ms, 0)
const nf = new Intl.NumberFormat('en')
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-7 px-4 pb-12 pt-9 sm:px-8">
    <div class="flex max-w-[860px] flex-col gap-2.5">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-4xl font-bold leading-tight tracking-[-0.01em]">One hour of tutoring</h1>
        <span class="rounded-full bg-marker-soft px-2.5 py-1 text-[13px] font-bold text-marker-ink">Sample data until the cost logger runs</span>
      </div>
      <p class="text-[19px] leading-normal">The camera sees everything. The AI sees almost nothing: each step below only passes on what the one before it couldn't settle.</p>
    </div>

    <section aria-label="What reaches each step" class="flex flex-col gap-4 rounded-md border border-line bg-paper px-7 py-[26px]">
      <h2 class="text-xl font-bold">What reaches each step</h2>
      <div v-for="row in cascade" :key="row.label" class="flex flex-wrap items-center gap-x-[18px] gap-y-1.5">
        <span class="basis-[300px] text-[15px] leading-snug"><b>{{ row.label }}</b><br /><span class="text-ink-2">{{ row.detail }}</span></span>
        <span class="h-[30px] flex-[1_1_300px]"><span class="block h-full rounded-[3px]" :class="BAR[row.tone]" :style="{ width: width(row.count) }" /></span>
        <b class="basis-[90px] text-right text-lg" :class="row.tone === 'marker' ? 'text-marker-ink' : ''">{{ nf.format(row.count) }}</b>
      </div>
      <p class="text-[13px] text-ink-2">Bar lengths use a log scale, otherwise the last four rows would be invisible.</p>
    </section>

    <div class="flex flex-wrap items-stretch gap-6">
      <section aria-label="Cost per hour" class="flex min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-md border border-line bg-paper px-6 py-[22px]">
        <h2 class="text-xl font-bold">Cost per hour of tutoring</h2>
        <div class="flex flex-col gap-1.5">
          <span class="flex justify-between gap-3 text-[15px]"><span>{{ cost.naive.label }}</span><b>${{ cost.naive.perHour.toFixed(2) }}</b></span>
          <span class="h-[18px] rounded-[3px] bg-[#9aa3b2]" />
          <span class="text-[13px] text-ink-2">{{ nf.format(cost.naive.calls) }} calls</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="flex justify-between gap-3 text-[15px]"><span>{{ cost.glimpse.label }}</span><b class="text-pen-deep">${{ cost.glimpse.perHour.toFixed(2) }}</b></span>
          <span class="h-[18px]"><span class="block h-full w-1 rounded-sm bg-pen" /></span>
          <span class="text-[13px] text-ink-2">{{ cost.glimpse.calls }} calls, everything else runs on the laptop</span>
        </div>
      </section>

      <section aria-label="Speed" class="flex min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-md border border-line bg-paper px-6 py-[22px]">
        <h2 class="text-xl font-bold">From lifting the pen to feedback</h2>
        <div role="img" :aria-label="`Median ${totalMs} milliseconds: ` + latency.map((l) => `${l.label} ${l.ms}`).join(', ')" class="flex h-[30px] overflow-hidden rounded-[3px]">
          <span v-for="(l, i) in latency" :key="l.label" :style="{ width: `${(l.ms / totalMs) * 100}%`, background: l.color }" :class="i < latency.length - 1 ? 'border-r-2 border-white' : ''" />
        </div>
        <div class="flex flex-wrap gap-x-[18px] gap-y-2 text-sm">
          <span v-for="l in latency" :key="l.label" class="inline-flex items-center gap-1.5"><span class="size-2.5" :style="{ background: l.color }" />{{ l.label }}, {{ l.ms }} ms</span>
        </div>
        <p class="text-[15px]">Median <b>{{ totalMs }} ms</b>. Asking a question out loud: <b>1.6 s</b> from letting go of the button to hearing the answer.</p>
      </section>
    </div>

    <section aria-label="Every call to a big model" class="flex flex-col gap-3 rounded-md border border-line bg-paper px-6 py-[22px]">
      <h2 class="text-xl font-bold">Every call to a big model</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[860px] border-collapse text-[15px]">
          <thead>
            <tr class="text-left text-[13px] text-ink-2">
              <th scope="col" class="pb-2 pr-2.5 font-bold">Time</th>
              <th scope="col" class="px-2.5 pb-2 font-bold">Step</th>
              <th scope="col" class="px-2.5 pb-2 font-bold">Why it escalated</th>
              <th scope="col" class="px-2.5 pb-2 font-bold">What was sent</th>
              <th scope="col" class="px-2.5 pb-2 text-right font-bold">Tokens</th>
              <th scope="col" class="px-2.5 pb-2 text-right font-bold">Cost</th>
              <th scope="col" class="pb-2 pl-2.5 font-bold">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in escalations" :key="e.time" class="border-t border-line-soft">
              <td class="py-2.5 pr-2.5">{{ e.time }}</td>
              <td class="p-2.5">{{ e.step }}</td>
              <td class="p-2.5">{{ e.why }}</td>
              <td class="p-2.5">{{ e.sent }}</td>
              <td class="p-2.5 text-right">{{ nf.format(e.tokens) }}</td>
              <td class="p-2.5 text-right">${{ e.cost.toFixed(4) }}</td>
              <td class="py-2.5 pl-2.5" :class="e.good ? 'font-bold text-pen-deep' : ''">{{ e.result }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
