<script setup lang="ts">
// Phonics: the letters of the word, then its sound buttons (a dot under a letter that makes a
// sound on its own, a line under letters that make one sound together, a curved link from a
// vowel to its magic e), then each sound said in turn, then the sounds blended into the word.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type Sound = { g: string; type: string; at: number; end?: number }
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { word: string; sounds: Sound[]; count: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'word'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const word = computed(() => String(s.value.word ?? '').trim())
const sounds = computed(() => (Array.isArray(s.value.sounds) ? s.value.sounds : []).filter((x) => x && typeof x.g === 'string' && Number.isInteger(x.at) && x.at >= 0 && x.at < word.value.length))
// the letters each sound is written with
const cover = (sd: Sound) => {
  const L = word.value.length
  if (sd.type === 'split') return [sd.at, Number.isInteger(sd.end) && (sd.end as number) > sd.at && (sd.end as number) < L ? (sd.end as number) : L - 1]
  return Array.from({ length: Math.max(1, sd.g.length) }, (_, j) => sd.at + j).filter((i) => i < L)
}
const color = (type: string) => (type === 'split' ? '#f47a2a' : type === 'trigraph' ? (grown.value ? '#b5a3ff' : '#7c5ce8') : type === 'digraph' ? (grown.value ? '#3fe0d0' : '#0f7f76') : ink.value)
const spread = computed(() => show.value === 'say')
const buttons = computed(() => show.value !== 'word')
const Y = 165

const lay = computed(() => {
  const L = Math.max(1, word.value.length)
  const owner = Array.from({ length: L }, () => -1)
  sounds.value.forEach((sd, k) => cover(sd).forEach((i) => owner[i] === -1 && (owner[i] = k)))
  // when the sounds are said, a gap opens wherever one sound ends and the next begins
  const before: number[] = []
  let G = 0
  for (let i = 0; i < L; i++) {
    if (i > 0 && owner[i] !== owner[i - 1]) G++
    before.push(G)
  }
  const gap = G ? Math.min(30, 170 / G) : 0
  const cw = Math.min(70, (580 - G * gap) / L)
  const fs = Math.min(80, cw * 1.1)
  const xs = (i: number) => 320 + (i - (L - 1) / 2) * cw
  const dx = (i: number) => before[i] * gap - (G * gap) / 2
  const type = (i: number) => sounds.value[owner[i]]?.type ?? 'single'
  const letters = [...word.value].map((ch, i) => ({ ch, i, x: xs(i), dx: dx(i), k: owner[i], color: color(type(i)) }))
  const items = sounds.value.map((sd, k) => {
    const c = cover(sd)
    const split = sd.type === 'split'
    const boxes = (split ? c.map((i) => [i, i]) : [[c[0], c[c.length - 1]]]).map(([a, b]) => ({ x0: xs(a) - cw / 2, x1: xs(b) + cw / 2, dx: dx(a) }))
    return { k, split, single: sd.type === 'single' || c.length === 1, color: color(sd.type), boxes, from: c[0], to: c[c.length - 1] }
  })
  const dotY = Y + fs * 0.55 + 16
  const hasSplit = items.some((it) => it.split)
  return { L, cw, fs, letters, items, xs, dx, dotY, arrowY: dotY + (hasSplit ? 52 : 30), width: L * cw + G * gap }
})
const lightAt = (k: number) => 0.75 + k * 0.8
const arc = (it: { from: number; to: number }) => {
  const { xs, dx, dotY } = lay.value
  const a = xs(it.from) + (spread.value ? dx(it.from) : 0)
  const b = xs(it.to) + (spread.value ? dx(it.to) : 0)
  const y = dotY - 2
  return `M${a} ${y} C${a} ${y + 40} ${b} ${y + 40} ${b} ${y}`
}
const letterFill = (l: { k: number; color: string }) => (show.value === 'word' ? ink.value : show.value === 'say' && l.k >= 0 ? '#18294a' : l.color)
const n = computed(() => lay.value.items.length)
const label = computed(() => `${n.value} sound${n.value === 1 ? '' : 's'} · ${word.value.length} letter${word.value.length === 1 ? '' : 's'}`)
const MOVE = 'transform 700ms cubic-bezier(0.45, -0.3, 0.4, 1.35)'
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${word}: ${label}`">
    <rect v-if="kid" :x="320 - lay.width / 2 - 28" :y="Y - lay.fs * 0.62 - 50" :width="lay.width + 56" :height="lay.arrowY - Y + lay.fs * 0.62 + 68" rx="26" fill="#fff" fill-opacity="0.85" />
    <!-- how many letters -->
    <template v-if="show === 'word'">
      <text v-for="l in lay.letters" :key="`n${l.i}`" :x="l.x" :y="Y - lay.fs * 0.62 - 16" font-size="18" font-weight="800" :fill="ink" fill-opacity="0.5" text-anchor="middle" class="scene-pop" :style="{ animationDelay: `${0.4 + l.i * 0.1}s` }">{{ l.i + 1 }}</text>
    </template>
    <!-- each sound: lit up when said, its button, its number -->
    <template v-for="it in lay.items" :key="it.k">
      <g v-for="(b, j) in it.boxes" :key="j" :style="{ transform: `translate(${spread ? b.dx : 0}px, 0px)`, transition: MOVE }">
        <rect v-if="show === 'say'" :x="b.x0 + 2" :y="Y - lay.fs * 0.62" :width="b.x1 - b.x0 - 4" :height="lay.dotY - Y + lay.fs * 0.62 + 14" :rx="Math.min(16, lay.fs * 0.25)" fill="#ffc93c" class="scene-pop" :style="{ animationDelay: `${lightAt(it.k)}s` }" />
        <template v-if="buttons && !it.split">
          <circle v-if="it.single" :cx="(b.x0 + b.x1) / 2" :cy="lay.dotY" :r="Math.min(9, lay.cw * 0.16)" :fill="it.color" class="scene-pop" :style="{ animationDelay: `${0.2 + it.k * 0.15}s` }" />
          <rect v-else :x="b.x0 + lay.cw * 0.18" :y="lay.dotY - 4" :width="b.x1 - b.x0 - lay.cw * 0.36" height="8" rx="4" :fill="it.color" class="scene-pop" :style="{ animationDelay: `${0.2 + it.k * 0.15}s` }" />
        </template>
        <g v-if="show === 'say' && j === 0" class="scene-pop" :style="{ animationDelay: `${lightAt(it.k)}s` }">
          <circle :cx="(b.x0 + b.x1) / 2" :cy="Y - lay.fs * 0.62 - 24" r="15" :fill="it.split ? '#f47a2a' : grown ? '#3fe0d0' : '#0f7f76'" />
          <text :x="(b.x0 + b.x1) / 2" :y="Y - lay.fs * 0.62 - 23" font-size="17" font-weight="900" :fill="grown && !it.split ? '#0b1d28' : '#fff'" text-anchor="middle" dominant-baseline="central">{{ it.k + 1 }}</text>
        </g>
      </g>
      <path v-if="buttons && it.split" :key="`arc-${show}`" :d="arc(it)" pathLength="1" fill="none" stroke="#f47a2a" stroke-width="6" stroke-linecap="round" class="scene-draw" :style="{ animationDelay: `${show === 'buttons' ? 0.3 : 0.7}s` }" />
    </template>
    <!-- the letters -->
    <g v-for="l in lay.letters" :key="l.i" :style="{ transform: `translate(${spread ? l.dx : 0}px, 0px)`, transition: MOVE }">
      <text :x="l.x" :y="Y" :font-size="lay.fs" font-weight="900" :fill="letterFill(l)" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${l.i * 0.05}s`, transition: 'fill 300ms', transitionDelay: show === 'say' && l.k >= 0 ? `${lightAt(l.k)}s` : '0s' }">{{ l.ch }}</text>
    </g>
    <!-- blend: one sweep under the whole word, and the count -->
    <template v-if="show === 'blend'">
      <path :d="`M${320 - (lay.L * lay.cw) / 2 + 8} ${lay.arrowY} L${320 + (lay.L * lay.cw) / 2 - 8} ${lay.arrowY}`" pathLength="1" fill="none" :stroke="grown ? '#ffc93c' : '#1f5fd6'" stroke-width="6" stroke-linecap="round" class="scene-draw" style="animation-delay: 0.7s" />
      <path :d="`M${320 + (lay.L * lay.cw) / 2 - 22} ${lay.arrowY - 11} L${320 + (lay.L * lay.cw) / 2 - 8} ${lay.arrowY} L${320 + (lay.L * lay.cw) / 2 - 22} ${lay.arrowY + 11}`" fill="none" :stroke="grown ? '#ffc93c' : '#1f5fd6'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" class="scene-pop" style="animation-delay: 1.6s" />
      <g class="scene-pop" style="animation-delay: 1.9s">
        <rect :x="320 - (label.length * 14 + 56) / 2" y="312" :width="label.length * 14 + 56" height="52" rx="26" :fill="kid ? '#fff' : '#0f7f76'" :stroke="kid ? '#0f7f76' : 'none'" :stroke-width="kid ? 5 : 0" />
        <text x="320" y="339" font-size="26" font-weight="900" :fill="kid ? '#0b6962' : '#fff'" text-anchor="middle" dominant-baseline="central">{{ label }}</text>
      </g>
    </template>
  </svg>
</template>
