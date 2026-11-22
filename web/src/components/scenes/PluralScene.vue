<script setup lang="ts">
// Plurals: one thing and its word; the rule (the letters that go crossed out, the ending that
// comes in colour); the word becoming its plural; two things and the plural.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { word: string; plural: string; rule: string; drop?: string; add?: string; picture?: string | null })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'one'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const ADD = '#f47a2a'
const RED = '#e5484d'
const word = computed(() => String(s.value.word ?? '').trim())
const plural = computed(() => String(s.value.plural ?? '').trim() || word.value)
const rule = computed(() => String(s.value.rule ?? 's'))
const picture = computed(() => (typeof s.value.picture === 'string' && s.value.picture ? s.value.picture : ''))
const special = computed(() => rule.value === 'irregular' || rule.value === 'same' || plural.value === word.value)

// what the two words share, what goes and what comes: baby → bab + (y) + ies
const cut = computed(() => {
  let k = 0
  while (k < word.value.length && k < plural.value.length && word.value[k] === plural.value[k]) k++
  return { stem: word.value.slice(0, k), drop: word.value.slice(k), add: plural.value.slice(k) }
})
const chip = computed(() => {
  const r = rule.value
  if (r === 'irregular') return kid.value ? '⭐ a special word' : 'a special word'
  if (r === 'same' || plural.value === word.value) return 'it stays the same'
  if (cut.value.drop) return `${cut.value.drop} → ${cut.value.add}`
  return `add ${cut.value.add}`
})

// one row of letter cells, as big as fits; a sign (+, →, =) takes 1.6 cells
type Cell = { ch: string; tone: 'ink' | 'add' | 'drop' | 'sign' | 'faint'; x: number }
function row(pieces: { text: string; tone: Cell['tone'] }[], maxCell = 66) {
  const units = pieces.flatMap((p) => (p.tone === 'sign' ? [{ ch: p.text, tone: p.tone, w: 1.6 }] : [...p.text].map((ch) => ({ ch, tone: p.tone, w: 1 }))))
  const total = Math.max(1, units.reduce((a, u) => a + u.w, 0))
  const cw = Math.min(maxCell, 570 / total)
  let at = 320 - (total * cw) / 2
  const cells: Cell[] = units.map((u) => {
    const x = at + (u.w * cw) / 2
    at += u.w * cw
    return { ch: u.ch, tone: u.tone, x }
  })
  return { cells, cw, fs: Math.min(76, cw * 1.18), x0: 320 - (total * cw) / 2, w: total * cw }
}
const singular = computed(() => row([{ text: word.value, tone: 'ink' }]))
const ruleRow = computed(() =>
  special.value
    ? row([{ text: word.value, tone: 'ink' }, { text: rule.value === 'same' || plural.value === word.value ? '=' : '→', tone: 'sign' }, { text: cut.value.stem, tone: 'ink' }, { text: cut.value.add, tone: 'add' }])
    : row([{ text: cut.value.stem, tone: 'ink' }, { text: cut.value.drop, tone: 'drop' }, { text: '+', tone: 'sign' }, { text: cut.value.add, tone: 'add' }]),
)
const pluralRow = computed(() => row([{ text: cut.value.stem, tone: 'ink' }, { text: cut.value.add, tone: 'add' }]))
const smallRow = computed(() => row([{ text: word.value, tone: 'faint' }], pluralRow.value.cw * 0.7))
const fill = (tone: Cell['tone']) => (tone === 'add' ? ADD : tone === 'drop' ? RED : tone === 'sign' ? (grown.value ? '#3fe0d0' : '#0f7f76') : ink.value)
// one thing, then two: the picture for little ones, plain counters for older ones
const things = computed(() => (show.value === 'two' ? [250, 390] : [320]))
const label = computed(() => (show.value === 'two' ? 'two' : 'one'))
const wordRow = computed(() => (show.value === 'two' ? pluralRow.value : singular.value))
const Y = 286
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`one ${word}, two ${plural}`">
    <!-- one, then two -->
    <g v-if="show === 'one' || show === 'two'" :key="show">
      <template v-for="(x, k) in things" :key="k">
        <text v-if="kid && picture" :x="x" y="128" font-size="104" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${k * 0.3}s` }">{{ picture }}</text>
        <g v-else class="scene-pop" :style="{ animationDelay: `${k * 0.3}s` }">
          <circle :cx="x" cy="128" :r="kid ? 46 : 34" :fill="ADD" :stroke="grown ? '#fff' : '#18294a'" stroke-opacity="0.25" stroke-width="4" />
          <text :x="x" y="129" font-size="30" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ k + 1 }}</text>
        </g>
      </template>
      <rect v-if="kid && wordRow.cells.length" :x="wordRow.x0 - 26" :y="Y - wordRow.fs * 0.62 - 50" :width="wordRow.w + 52" :height="wordRow.fs * 1.24 + 72" rx="24" fill="#fff" fill-opacity="0.85" />
      <text x="320" :y="Y - wordRow.fs * 0.62 - 20" font-size="26" font-weight="900" :fill="grown ? '#3fe0d0' : '#0f7f76'" text-anchor="middle" class="scene-pop">{{ label }}</text>
      <text v-for="(c, i) in wordRow.cells" :key="i" :x="c.x" :y="Y" :font-size="wordRow.fs" font-weight="900" :fill="fill(c.tone)" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${0.2 + i * 0.05}s` }">{{ c.ch }}</text>
    </g>

    <!-- the rule: what goes, what comes -->
    <g v-else-if="show === 'rule'" key="rule">
      <g class="scene-pop">
        <rect :x="320 - (chip.length * 13 + 48) / 2" y="62" :width="chip.length * 13 + 48" height="48" rx="24" :fill="grown ? '#ffffff1f' : '#fff'" :stroke="grown ? '#3fe0d0' : '#0f7f76'" stroke-width="3" />
        <text x="320" y="87" font-size="24" font-weight="900" :fill="grown ? '#3fe0d0' : '#0b6962'" text-anchor="middle" dominant-baseline="central">{{ chip }}</text>
      </g>
      <rect v-if="kid && ruleRow.cells.length" :x="ruleRow.x0 - 24" :y="210 - ruleRow.fs * 0.62 - 22" :width="ruleRow.w + 48" :height="ruleRow.fs * 1.24 + 44" rx="24" fill="#fff" fill-opacity="0.85" />
      <template v-for="(c, i) in ruleRow.cells" :key="i">
        <text :x="c.x" y="210" :font-size="c.tone === 'sign' ? ruleRow.fs * 0.9 : ruleRow.fs" font-weight="900" :fill="fill(c.tone)" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${c.tone === 'add' || c.tone === 'sign' ? 0.9 + i * 0.08 : i * 0.05}s` }">{{ c.ch }}</text>
        <line v-if="c.tone === 'drop'" :x1="c.x - ruleRow.cw * 0.42" :y1="210 + ruleRow.fs * 0.25" :x2="c.x + ruleRow.cw * 0.42" :y2="210 - ruleRow.fs * 0.25" pathLength="1" :stroke="RED" stroke-width="5" stroke-linecap="round" class="scene-draw" style="animation-delay: 0.5s" />
      </template>
    </g>

    <!-- the word becomes its plural -->
    <g v-else key="build">
      <text v-for="(c, i) in smallRow.cells" :key="`s${i}`" :x="c.x" y="128" :font-size="smallRow.fs" font-weight="900" :fill="ink" fill-opacity="0.55" text-anchor="middle" dominant-baseline="central">{{ c.ch }}</text>
      <path d="M320 168 L320 214 M306 200 L320 214 L334 200" fill="none" :stroke="grown ? '#3fe0d0' : '#0f7f76'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" class="scene-pop" style="animation-delay: 0.3s" />
      <rect v-if="kid && pluralRow.cells.length" :x="pluralRow.x0 - 24" :y="276 - pluralRow.fs * 0.62 - 20" :width="pluralRow.w + 48" :height="pluralRow.fs * 1.24 + 40" rx="24" fill="#fff" fill-opacity="0.85" />
      <text v-for="(c, i) in pluralRow.cells" :key="`p${i}`" :x="c.x" y="276" :font-size="pluralRow.fs" font-weight="900" :fill="fill(c.tone)" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${c.tone === 'add' ? 0.9 + i * 0.1 : 0.5 + i * 0.04}s` }">{{ c.ch }}</text>
    </g>
  </svg>
</template>
