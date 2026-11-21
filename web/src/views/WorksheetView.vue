<script setup lang="ts">
// A printable A4 sheet whose lines sit exactly where the camera frame expects them, so the
// ticks and circles drawn on the camera land on the right line.
import { printedSlots } from '@/lib/geometry'

const print = () => window.print()
</script>

<template>
  <div class="min-h-screen bg-[#e6edf3] px-4 py-8 print:bg-white print:p-0">
    <div class="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
      <p class="text-[15px] font-bold text-ink-2">Print at 100 %, then put the sheet in the middle of the camera picture, filling it top to bottom.</p>
      <button type="button" class="btn-lagoon min-h-11 rounded-xl px-5 font-black" @click="print">Print the sheet</button>
    </div>
    <div class="relative mx-auto bg-white shadow-xl print:shadow-none" style="width: 210mm; height: 297mm">
      <span v-for="c in ['left-[6mm] top-[6mm]', 'right-[6mm] top-[6mm]', 'left-[6mm] bottom-[6mm]', 'right-[6mm] bottom-[6mm]']" :key="c" class="absolute size-[12mm] bg-black" :class="c" />
      <div class="absolute left-[22mm] right-[22mm] top-[8mm] flex items-end justify-between text-[11pt] text-[#5b6b84]">
        <span class="font-black text-[#0f7f76]">Glimpse</span>
        <span>Name: ______________________</span>
      </div>
      <div v-for="(s, i) in printedSlots" :key="i" class="absolute left-[6%] right-[6%] border-b-[0.4mm] border-[#9aa3b2]" :style="{ top: `${s.top}%`, height: `${s.height}%` }">
        <span class="absolute -left-[5mm] bottom-[2mm] flex size-[7mm] items-center justify-center rounded-full border-[0.3mm] border-[#9aa3b2] text-[10pt] font-black text-[#5b6b84]">{{ i + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4;
    margin: 0;
  }
}
</style>
