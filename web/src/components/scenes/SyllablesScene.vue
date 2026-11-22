<script setup lang="ts">
// Syllables: the word, its vowels lit up (each one a beat), the word pulled apart into its
// beats, then each beat clapped (a clap for little ones, a numbered beat for older ones).
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { word: string; parts: string[]; vowels: number[]; count: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'word'))
const kid = computed(() => s.value.skin === 'kid')
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const PAL = computed(() => (s.value.skin === 'grown' ? ['#f47a2a', '#3fe0d0', '#b5a3ff', '#86b4ff', '#4cd38f'] : ['#f47a2a', '#0f7f76', '#7c5ce8', '#1f5fd6', '#22a06b']))
const word = computed(() => String(s.value.word ?? '').trim())
// the beats; if they don't spell the word, the whole word is one beat
const parts = computed(() => {
  const ps = Array.isArray(s.value.parts) ? s.value.parts.map((p) => String(p ?? '')).filter(Boolean) : []
  return ps.length && ps.join('') === word.value ? ps : [word.value].filter(Boolean)
})
const n = computed(() => parts.value.length)
const vowels = computed(() => new Set((Array.isArray(s.value.vowels) ? s.value.vowels : []).filter((i) => Number.isInteger(i))))
const split = computed(() => show.value === 'split' || show.value === 'clap')
const Y = 196

// One cell per letter; in the split the beats move apart by `gap`.
const lay = computed(() => {
  const L = Math.max(1, word.value.length)
  const gap = n.value > 1 ? Math.min(40, Math.max(22, 120 / (n.value - 1))) : 0
  const cw = Math.min(60, (580 - (n.value - 1) * gap) / L)
  const fs = Math.min(72, cw * 1.2)
  let i = 0
  const groups = parts.value.map((p, k) => {
    const letters = [...p].map((ch) => {
      const at = i++
      return { ch, at, x: 320 + (at - (L - 1) / 2) * cw, vowel: vowels.value.has(at) }
    })
    // runs of vowels next to each other light up as one beat
    const runs: { x: number; w: number }[] = []
    letters.forEach((l, j) => {
      if (!l.vowel) return
      if (j > 0 && letters[j - 1].vowel) runs[runs.length - 1].w += cw
      else runs.push({ x: l.x - cw / 2, w: cw })
    })
    const x0 = letters[0].x - cw / 2
    const x1 = letters[letters.length - 1].x + cw / 2
    return { k, letters, runs, x0, x1, cx: (x0 + x1) / 2, off: (k - (n.value - 1) / 2) * gap, color: PAL.value[k % PAL.value.length] }
  })
  return { L, gap, cw, fs, groups, width: L * cw + (n.value - 1) * gap }
})
const dots = computed(() => lay.value.groups.slice(0, -1).map((g) => ({ k: g.k, x: g.x1 + g.off + lay.value.gap / 2 })))
const clapAt = (k: number) => 0.35 + k * 0.75
const letterFill = (l: { vowel: boolean }, color: string) => (split.value ? color : show.value === 'vowels' && l.vowel ? '#18294a' : ink.value)
const label = computed(() => `${n.value} syllable${n.value === 1 ? '' : 's'}`)
const MOVE = 'transform 700ms cubic-bezier(0.45, -0.3, 0.4, 1.35)'
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${word}: ${label}`">
    <rect v-if="kid" :x="320 - lay.width / 2 - 26" :y="Y - lay.fs * 0.62 - 22" :width="lay.width + 52" :height="lay.fs * 1.24 + 44" rx="26" fill="#fff" fill-opacity="0.85" />
    <g v-for="g in lay.groups" :key="g.k" :style="{ transform: `translate(${split ? g.off : 0}px, 0px)`, transition: MOVE }">
      <g :class="show === 'clap' ? 'scene-hop' : ''" :style="{ animationDelay: `${clapAt(g.k)}s` }">
        <rect v-if="split" :x="g.x0 + 3" :y="Y - lay.fs * 0.62" :width="g.x1 - g.x0 - 6" :height="lay.fs * 1.24" :rx="Math.min(18, lay.fs * 0.3)" :fill="g.color" fill-opacity="0.14" :stroke="g.color" stroke-width="3" class="scene-pop" :style="{ animationDelay: `${0.5 + g.k * 0.12}s` }" />
        <template v-if="show === 'vowels'">
          <g v-for="(r, j) in g.runs" :key="`v${j}`" class="scene-pop" :style="{ animationDelay: `${0.2 + (g.k + j) * 0.25}s` }">
            <rect :x="r.x + 3" :y="Y - lay.fs * 0.62" :width="r.w - 6" :height="lay.fs * 1.24" :rx="Math.min(16, lay.fs * 0.28)" fill="#ffc93c" />
            <circle :cx="r.x + r.w / 2" :cy="Y - lay.fs * 0.62 - 16" r="7" fill="#f47a2a" />
          </g>
        </template>
        <text
          v-for="l in g.letters"
          :key="l.at"
          :x="l.x"
          :y="Y"
          :font-size="lay.fs"
          font-weight="900"
          :fill="letterFill(l, g.color)"
          text-anchor="middle"
          dominant-baseline="central"
          class="scene-pop"
          :style="{ animationDelay: `${l.at * 0.05}s`, transition: 'fill 400ms' }"
        >{{ l.ch }}</text>
      </g>
      <!-- the clap (or a numbered beat) above each part -->
      <g v-if="show === 'clap'" class="scene-pop" :style="{ animationDelay: `${clapAt(g.k)}s` }">
        <text v-if="kid" :x="g.cx" :y="Y - lay.fs * 0.62 - 44" font-size="44" text-anchor="middle" dominant-baseline="central">👏</text>
        <template v-else>
          <circle :cx="g.cx" :cy="Y - lay.fs * 0.62 - 36" r="19" :fill="g.color" />
          <text :x="g.cx" :y="Y - lay.fs * 0.62 - 35" font-size="20" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ g.k + 1 }}</text>
        </template>
      </g>
    </g>
    <template v-if="split">
      <circle v-for="d in dots" :key="d.k" :cx="d.x" :cy="Y" r="6" :fill="ink" class="scene-pop" :style="{ animationDelay: `${0.6 + d.k * 0.12}s` }" />
    </template>
    <g v-if="show === 'clap' && n" class="scene-pop" :style="{ animationDelay: `${clapAt(n)}s` }">
      <rect :x="320 - (label.length * 17 + 60) / 2" y="306" :width="label.length * 17 + 60" height="56" rx="28" :fill="kid ? '#fff' : '#0f7f76'" :stroke="kid ? '#0f7f76' : 'none'" :stroke-width="kid ? 5 : 0" />
      <text x="320" y="335" font-size="30" font-weight="900" :fill="kid ? '#0b6962' : '#fff'" text-anchor="middle" dominant-baseline="central">{{ label }}</text>
    </g>
  </svg>
</template>
