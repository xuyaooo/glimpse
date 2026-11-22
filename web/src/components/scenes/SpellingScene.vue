<script setup lang="ts">
// Spelling: what the child wrote (in pencil), then that above the right word letter by letter,
// the wrong letters crossed out and the missing ones popping in, the word in its beats, and
// the word written again one letter at a time. "Spell X" (no attempt) shows the word, its beats
// and the letters one by one.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type Op = { op: string; a?: string; b?: string }
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { word: string; attempt: string | null; ops: Op[]; parts: string[] })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'word'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const GREEN = computed(() => (grown.value ? '#4cd38f' : '#22a06b'))
const RED = '#e5484d'
const PAL = computed(() => (grown.value ? ['#f47a2a', '#3fe0d0', '#b5a3ff', '#86b4ff', '#4cd38f'] : ['#f47a2a', '#0f7f76', '#7c5ce8', '#1f5fd6', '#22a06b']))
const word = computed(() => String(s.value.word ?? '').trim())
const attempt = computed(() => (typeof s.value.attempt === 'string' ? s.value.attempt.trim() : ''))
const parts = computed(() => {
  const ps = Array.isArray(s.value.parts) ? s.value.parts.map((p) => String(p ?? '')).filter(Boolean) : []
  return ps.length && ps.join('') === word.value ? ps : [word.value]
})

// ---- what was written above the right word, one column per letter
const cols = computed(() => {
  const ops = (Array.isArray(s.value.ops) ? s.value.ops : []).map((o, j) => {
    const op = ['same', 'swap', 'add', 'drop'].includes(String(o?.op)) ? String(o.op) : 'same'
    const a = String(o?.a ?? '')
    const b = String(o?.b ?? '')
    return { j, op, top: op === 'add' ? '' : op === 'same' ? b || a : a, bot: op === 'drop' ? '' : b || a }
  })
  return ops.length && ops.map((c) => c.bot).join('') === word.value ? ops : [...word.value].map((ch, j) => ({ j, op: 'same', top: ch, bot: ch }))
})
const wrong = computed(() => cols.value.filter((c) => c.op !== 'same'))
const fixAt = (j: number) => 0.3 + wrong.value.findIndex((c) => c.j === j) * 0.5
const grid = computed(() => {
  const C = Math.max(1, cols.value.length)
  const cw = Math.min(64, 580 / C)
  const fs = Math.min(60, cw * 1.12)
  const Y1 = 196
  return { C, cw, fs, Y0: Y1 - fs * 1.05 - 6, Y1, Y2: Y1 + fs * 1.5 + 22, x: (j: number) => 320 + (j - (C - 1) / 2) * cw, left: 320 - (C * cw) / 2 }
})

// ---- handwriting is laid out with the real width of each letter (hundredths of an em, measured
// in the browser): Kalam (the child's pencil) and Caveat (the marker)
const ABC = 'abcdefghijklmnopqrstuvwxyz'
const KALAM = [47, 53, 45, 50, 45, 38, 47, 54, 24, 25, 47, 24, 80, 53, 45, 48, 47, 33, 43, 39, 48, 42, 67, 43, 47, 44]
const CAVEAT = [45, 45, 36, 40, 33, 31, 36, 48, 21, 23, 38, 19, 58, 46, 36, 38, 38, 36, 35, 35, 37, 34, 52, 36, 35, 34]
const ems = (t: string, table: number[]) => [...t].map((c) => (table[ABC.indexOf(c.toLowerCase())] ?? 55) / 100)

// ---- the attempt in pencil on a writing line
const att = computed(() => {
  const unit = Math.max(0.5, ems(attempt.value, KALAM).reduce((a, b) => a + b, 0) * 1.05)
  const fs = Math.min(92, 520 / unit)
  return { fs, w: unit * fs, base: 236 }
})

// ---- the word, then in its beats (or letter by letter when it is one beat)
const beats = computed(() => {
  const many = parts.value.length > 1
  const units = many ? parts.value : [...word.value]
  const N = units.length
  const L = Math.max(1, word.value.length)
  const gap = N > 1 ? (many ? Math.min(40, Math.max(22, 120 / (N - 1))) : Math.min(14, 150 / (N - 1))) : 0
  const cw = Math.min(66, (580 - (N - 1) * gap) / L)
  const fs = Math.min(74, cw * 1.18)
  let i = 0
  const groups = units.map((u, k) => {
    const letters = [...u].map((ch) => {
      const at = i++
      return { ch, at, x: 320 + (at - (L - 1) / 2) * cw }
    })
    const x0 = letters[0].x - cw / 2
    const x1 = letters[letters.length - 1].x + cw / 2
    return { k, letters, x0, x1, off: (k - (N - 1) / 2) * gap, color: many ? PAL.value[k % PAL.value.length] : grown.value ? '#3fe0d0' : '#0f7f76' }
  })
  return { many, gap, cw, fs, groups, width: L * cw + (N - 1) * gap }
})
const apart = computed(() => show.value === 'parts')
const Y = 200

// ---- written one letter at a time
const wr = computed(() => {
  const adv = ems(word.value, CAVEAT).map((e) => e + 0.06)
  const unit = Math.max(0.5, adv.reduce((a, b) => a + b, 0))
  const fs = Math.min(104, 540 / unit)
  let at = 320 - (unit * fs) / 2
  const xs = adv.map((e) => {
    const x = at + (e * fs) / 2
    at += e * fs
    return x
  })
  return { L: adv.length, fs, base: 250, xs, w: unit * fs }
})
const writeAt = (i: number) => 0.3 + i * 0.35
const MOVE = 'transform 700ms cubic-bezier(0.45, -0.3, 0.4, 1.35)'
const lineInk = computed(() => (grown.value ? '#ffffff' : '#18294a'))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="attempt ? `${attempt}: the word is ${word}` : `Spelling ${word}`">
    <!-- what the child wrote -->
    <g v-if="show === 'attempt'" key="attempt">
      <rect v-if="kid" :x="320 - att.w / 2 - 50" :y="att.base - att.fs * 1.05" :width="att.w + 100" :height="att.fs * 1.45" rx="22" fill="#fff" fill-opacity="0.85" />
      <line :x1="320 - att.w / 2 - 34" :x2="320 + att.w / 2 + 34" :y1="att.base" :y2="att.base" :stroke="lineInk" stroke-opacity="0.45" stroke-width="2.5" />
      <line :x1="320 - att.w / 2 - 34" :x2="320 + att.w / 2 + 34" :y1="att.base - att.fs * 0.42" :y2="att.base - att.fs * 0.42" :stroke="lineInk" stroke-opacity="0.22" stroke-width="2" stroke-dasharray="8 8" />
      <text x="320" :y="att.base" :font-size="att.fs" font-weight="400" :fill="ink" text-anchor="middle" class="font-pencil scene-pop">{{ attempt }}</text>
      <text v-if="kid && 320 + att.w / 2 + 40 <= 606" :x="320 + att.w / 2 + 40" :y="att.base - att.fs * 0.6" font-size="40" text-anchor="middle" dominant-baseline="central" class="scene-pop" style="animation-delay: 0.4s">✏️</text>
    </g>

    <!-- the attempt above the right word, letter by letter -->
    <g v-else-if="show === 'compare' || show === 'fix'" key="grid">
      <rect v-if="kid" :x="grid.left - 18" :y="grid.Y0 - grid.fs * 0.6" :width="grid.C * grid.cw + 36" :height="grid.Y2 - grid.Y0 + grid.fs * 1.25" rx="24" fill="#fff" fill-opacity="0.85" />
      <template v-if="kid && grid.left >= 72">
        <text :x="grid.left - 46" :y="grid.Y1" font-size="34" text-anchor="middle" dominant-baseline="central">✏️</text>
        <text :x="grid.left - 46" :y="grid.Y2" font-size="34" text-anchor="middle" dominant-baseline="central">✅</text>
      </template>
      <g v-for="c in cols" :key="c.j">
        <rect v-if="c.op !== 'same'" :x="grid.x(c.j) - grid.cw / 2 + 2" :y="grid.Y0 - grid.fs * 0.55" :width="grid.cw - 4" :height="grid.Y2 - grid.Y0 + grid.fs * 1.15" rx="10" fill="#ffc93c" :fill-opacity="grown ? 0.14 : show === 'fix' ? 0.25 : 0.45" :stroke="grown ? '#ffc93c' : 'none'" stroke-opacity="0.75" stroke-width="2.5" class="scene-pop" :style="{ animationDelay: `${0.3 + c.j * 0.06}s`, transition: 'fill-opacity 400ms' }" />
        <line v-else :x1="grid.x(c.j)" :x2="grid.x(c.j)" :y1="grid.Y1 + grid.fs * 0.5" :y2="grid.Y2 - grid.fs * 0.55" :stroke="ink" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="3 5" />
        <!-- the child's letter (pencil) -->
        <rect v-if="c.op === 'add'" :x="grid.x(c.j) - grid.cw * 0.36" :y="grid.Y1 - grid.fs * 0.45" :width="grid.cw * 0.72" :height="grid.fs * 0.9" rx="6" fill="none" :stroke="show === 'fix' ? GREEN : ink" stroke-opacity="0.6" stroke-width="2.5" stroke-dasharray="6 5" />
        <text v-else :x="grid.x(c.j)" :y="grid.Y1" :font-size="grid.fs" font-weight="400" :fill="show === 'fix' && c.op !== 'same' ? RED : ink" text-anchor="middle" dominant-baseline="central" class="font-pencil" style="transition: fill 400ms" :style="{ transitionDelay: show === 'fix' ? `${fixAt(c.j)}s` : '0s' }">{{ c.top }}</text>
        <template v-if="show === 'fix'">
          <line v-if="c.op === 'swap' || c.op === 'drop'" :x1="grid.x(c.j) - grid.cw * 0.38" :y1="grid.Y1 + grid.fs * 0.22" :x2="grid.x(c.j) + grid.cw * 0.38" :y2="grid.Y1 - grid.fs * 0.22" pathLength="1" :stroke="RED" stroke-width="5" stroke-linecap="round" class="scene-draw" :style="{ animationDelay: `${fixAt(c.j)}s` }" />
          <text v-if="c.op === 'swap' || c.op === 'add'" :x="grid.x(c.j)" :y="c.op === 'swap' ? grid.Y0 : grid.Y1" :font-size="grid.fs" font-weight="900" :fill="GREEN" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${fixAt(c.j) + 0.25}s` }">{{ c.bot }}</text>
        </template>
        <!-- the right word -->
        <text v-if="c.bot" :x="grid.x(c.j)" :y="grid.Y2" :font-size="grid.fs" font-weight="900" :fill="show === 'fix' && c.op !== 'same' ? GREEN : ink" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${c.j * 0.05}s`, transition: 'fill 400ms' }">{{ c.bot }}</text>
      </g>
    </g>

    <!-- the word, then in its beats -->
    <g v-else-if="show === 'word' || show === 'parts'" key="beats">
      <rect v-if="kid" :x="320 - beats.width / 2 - 26" :y="Y - beats.fs * 0.62 - 22" :width="beats.width + 52" :height="beats.fs * 1.24 + 44" rx="26" fill="#fff" fill-opacity="0.85" />
      <g v-for="g in beats.groups" :key="g.k" :style="{ transform: `translate(${apart ? g.off : 0}px, 0px)`, transition: MOVE }">
        <rect v-if="apart" :x="g.x0 + 3" :y="Y - beats.fs * 0.62" :width="g.x1 - g.x0 - 6" :height="beats.fs * 1.24" :rx="Math.min(18, beats.fs * 0.3)" :fill="g.color" fill-opacity="0.14" :stroke="g.color" stroke-width="3" class="scene-pop" :style="{ animationDelay: `${0.5 + g.k * 0.12}s` }" />
        <text v-for="l in g.letters" :key="l.at" :x="l.x" :y="Y" :font-size="beats.fs" font-weight="900" :fill="apart ? g.color : ink" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${l.at * 0.05}s`, transition: 'fill 400ms' }">{{ l.ch }}</text>
      </g>
      <template v-if="apart && beats.many">
        <circle v-for="g in beats.groups.slice(0, -1)" :key="`d${g.k}`" :cx="g.x1 + g.off + beats.gap / 2" :cy="Y" r="6" :fill="ink" class="scene-pop" :style="{ animationDelay: `${0.6 + g.k * 0.12}s` }" />
      </template>
    </g>

    <!-- written one letter at a time -->
    <g v-else key="write">
      <rect v-if="kid" :x="320 - wr.w / 2 - 40" :y="wr.base - wr.fs * 1.0" :width="wr.w + 80" :height="wr.fs * 1.4" rx="22" fill="#fff" fill-opacity="0.85" />
      <line :x1="320 - wr.w / 2 - 28" :x2="320 + wr.w / 2 + 28" :y1="wr.base" :y2="wr.base" :stroke="lineInk" stroke-opacity="0.45" stroke-width="2.5" />
      <line :x1="320 - wr.w / 2 - 28" :x2="320 + wr.w / 2 + 28" :y1="wr.base - wr.fs * 0.38" :y2="wr.base - wr.fs * 0.38" :stroke="lineInk" stroke-opacity="0.22" stroke-width="2" stroke-dasharray="8 8" />
      <text v-for="(ch, i) in [...word]" :key="i" :x="wr.xs[i]" :y="wr.base" :font-size="wr.fs" font-weight="700" :fill="grown ? '#9cc2ff' : '#1f5fd6'" text-anchor="middle" class="font-marker scene-pop" :style="{ animationDelay: `${writeAt(i)}s` }">{{ ch }}</text>
      <text v-if="kid && 320 + wr.w / 2 + 30 <= 606" :x="320 + wr.w / 2 + 30" :y="wr.base - wr.fs * 0.55" font-size="40" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${writeAt(wr.L)}s` }">✏️</text>
    </g>
  </svg>
</template>
