<script setup lang="ts">
// Speed, distance, time: the triangle (distance on top, speed × time underneath), the values
// put in it, the unknown covered to read the formula, then a drive along a road with the time
// marks, and the answer.
import { computed, nextTick, ref, watch } from 'vue'
import type { Scene } from '@/lib/types'

type Key = 'd' | 'v' | 't'
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { d: number; t: number; v: number; dUnit: string; tUnit: string; vUnit: string; unknown: Key; result: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'triangle'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const blue = computed(() => (grown.value ? '#8fb8ff' : '#1f5fd6'))
const svg = ref<SVGSVGElement | null>(null)
// the car leaves from 0 when the drive begins
watch(
  () => props.stage,
  () => nextTick(() => svg.value?.setCurrentTime?.(0)),
)

const SUP: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const group = (t: string) => t.replace(/^(-?\d+)/, (d) => (d.replace('-', '').length > 4 ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : d))
const fmt = (v: number) => {
  if (!Number.isFinite(v)) return '?'
  const a = Math.abs(v)
  if (a >= 1e9 || (a > 0 && a < 1e-4)) {
    const [m, e] = v.toExponential(3).split('e')
    return `${+m} × 10${[...String(+e)].map((c) => SUP[c] ?? c).join('')}`
  }
  return group(String(Math.round(v * 1e4) / 1e4))
}
const fit = (text: string, max: number, width: number) => Math.min(max, width / (Math.max(1, text.length) * 0.6))

const WORD: Record<Key, string> = { d: 'distance', v: 'speed', t: 'time' }
const ICON: Record<Key, string> = { d: '🛣️', v: '💨', t: '⏱️' }
const unitOf = (k: Key) => (k === 'd' ? s.value.dUnit : k === 't' ? s.value.tUnit : s.value.vUnit)
// "26.2 miles", "1 mile"
const unitFor = (u: string, v: number) => (u === 'mile' && v !== 1 ? 'miles' : u)
const val = (k: Key) => (k === 'd' ? s.value.d : k === 't' ? s.value.t : s.value.v)
const known = (k: Key) => k !== s.value.unknown
const valueText = (k: Key) => (known(k) || show.value === 'drive' ? `${fmt(val(k))} ${unitFor(unitOf(k), val(k))}` : '?')
// words for children, letters for grown-ups
const say = (k: Key) => (grown.value ? k : WORD[k])

// the triangle: apex (215, 34), base from (40, 316) to (390, 316), cut at y = 175
const CELLS: Record<Key, { name: [number, number]; value: [number, number]; width: number; cover: string }> = {
  d: { name: [215, 120], value: [215, 156], width: 130, cover: '215,50 291,168 139,168' },
  v: { name: [152, 222], value: [146, 268], width: 120, cover: '136,182 208,182 208,309 58,309' },
  t: { name: [278, 222], value: [284, 268], width: 120, cover: '222,182 294,182 372,309 222,309' },
}
const keys: Key[] = ['d', 'v', 't']
const formula = computed(() => {
  const u = s.value.unknown
  const [a, op, b] = u === 'v' ? ['d', '÷', 't'] : u === 't' ? ['d', '÷', 'v'] : ['v', '×', 't']
  return { text: `${say(u)} = ${say(a as Key)} ${op} ${say(b as Key)}`, numbers: `= ${fmt(val(a as Key))} ${op} ${fmt(val(b as Key))}` }
})
const knownLines = computed(() => keys.map((k) => ({ k, text: known(k) ? `${say(k)} = ${fmt(val(k))} ${unitFor(unitOf(k), val(k))}` : `${say(k)} = ?` })))

// the road: from X0 to X1, a mark every nice step of time
const X0 = 70
const X1 = 570
const marks = computed(() => {
  const t = s.value.t
  if (!(t > 0) || !Number.isFinite(t)) return []
  let step = 1
  for (let e = -6; e <= 9; e++) {
    const found = [1, 2, 5].map((m) => m * 10 ** e).find((st) => t / st <= 6)
    if (found) {
      step = found
      break
    }
  }
  const out: { x: number; time: string; dist: string; end: boolean }[] = []
  for (let k = 0; k * step < t - 1e-9 && k < 12; k++) {
    const x = X0 + ((k * step) / t) * (X1 - X0)
    if (k > 0 && X1 - x < 70) continue
    out.push({ x, time: `${fmt(k * step)} ${s.value.tUnit}`, dist: `${fmt(s.value.v * k * step)} ${unitFor(s.value.dUnit, s.value.v * k * step)}`, end: false })
  }
  out.push({ x: X1, time: `${fmt(t)} ${s.value.tUnit}`, dist: `${fmt(s.value.d)} ${unitFor(s.value.dUnit, s.value.d)}`, end: true })
  return out
})
const markFont = (m: { time: string; dist: string }) => Math.min(15, 76 / (Math.max(m.time.length, m.dist.length) * 0.6))

const answer = computed(() => `${say(s.value.unknown)} = ${fmt(s.value.result)} ${unitFor(unitOf(s.value.unknown), s.value.result)}`)
const answerFont = computed(() => fit(answer.value, 30, 330))
const answerW = computed(() => answer.value.length * 0.6 * answerFont.value + 44)
const hours = computed(() => {
  const r = s.value.result
  if (s.value.unknown !== 't' || s.value.tUnit !== 'h' || Number.isInteger(r) || !(r > 0) || r > 1e6) return ''
  const h = Math.floor(r)
  const m = Math.round((r - h) * 600) / 10
  return m >= 60 ? '' : `= ${h} h ${m} min`
})
</script>

<template>
  <svg ref="svg" viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${WORD[s.unknown]} = ${fmt(s.result)} ${unitOf(s.unknown)}`">
    <!-- the triangle (small in the corner while the car drives) -->
    <g :style="{ transform: show === 'drive' ? 'translate(10px, 6px) scale(0.42)' : 'none', transformOrigin: '0px 0px', transition: 'transform 800ms cubic-bezier(0.3, 1.2, 0.5, 1)' }">
      <path d="M215 34 L390 316 L40 316 Z" pathLength="1" :fill="grown ? '#ffffff12' : '#ffffffb3'" :stroke="ink" stroke-width="4" stroke-linejoin="round" class="scene-draw" />
      <line x1="127.5" y1="175" x2="302.5" y2="175" :stroke="ink" stroke-width="3" />
      <line x1="215" y1="175" x2="215" y2="316" :stroke="ink" stroke-width="3" />
      <circle cx="215" cy="245" r="14" :fill="grown ? '#0b1d28' : '#fff'" :stroke="ink" stroke-width="2" />
      <text x="215" y="246" font-size="20" font-weight="900" :fill="ink" text-anchor="middle" dominant-baseline="central">×</text>
      <g v-for="k in keys" :key="k">
        <text v-if="kid && k === 'd'" x="215" y="88" font-size="24" text-anchor="middle">{{ ICON.d }}</text>
        <text :x="CELLS[k].name[0]" :y="CELLS[k].name[1]" font-size="18" font-weight="800" :fill="k === s.unknown && show !== 'triangle' ? '#f47a2a' : ink" text-anchor="middle">{{ kid && k !== 'd' ? `${ICON[k]} ` : '' }}{{ WORD[k] }}</text>
        <text v-if="show !== 'triangle' && !(show === 'formula' && k === s.unknown)" :key="`${k}-${valueText(k)}`" :x="CELLS[k].value[0]" :y="CELLS[k].value[1]" :font-size="fit(valueText(k), 24, CELLS[k].width)" font-weight="900" :fill="k === s.unknown ? (show === 'drive' ? (grown ? '#3fe0d0' : '#0f7f76') : '#f47a2a') : blue" text-anchor="middle" class="scene-pop" :style="{ animationDelay: `${keys.indexOf(k) * 0.25}s` }">{{ valueText(k) }}</text>
      </g>
      <!-- cover the one we want: what is left is the formula -->
      <g v-if="show === 'formula'" class="scene-pop">
        <polygon :points="CELLS[s.unknown].cover" fill="#ffc93c" stroke="#e0a21a" stroke-width="3" stroke-linejoin="round" />
        <text :x="CELLS[s.unknown].value[0]" :y="CELLS[s.unknown].value[1] - 18" font-size="40" font-weight="900" fill="#18294a" text-anchor="middle" dominant-baseline="central">{{ kid ? '✋' : '?' }}</text>
      </g>
    </g>

    <!-- beside the triangle -->
    <g v-if="show === 'triangle'">
      <template v-if="kid">
        <g class="scene-pop">
          <text x="520" y="170" font-size="72" text-anchor="middle" dominant-baseline="central" transform="translate(1040 0) scale(-1 1)">🚗</text>
          <text x="448" y="182" font-size="30" text-anchor="middle" dominant-baseline="central" opacity="0.8">💨</text>
        </g>
        <text x="520" y="262" font-size="16" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.4s">distance = speed × time</text>
      </template>
      <template v-else>
        <text x="520" y="170" font-size="38" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop">d = v × t</text>
        <text v-for="(k, i) in keys" :key="k" x="520" :y="222 + i * 26" font-size="16" font-weight="700" :fill="ink" fill-opacity="0.75" text-anchor="middle" class="scene-pop" :style="{ animationDelay: `${0.3 + i * 0.15}s` }">{{ k }} = {{ WORD[k] }}</text>
      </template>
    </g>
    <g v-if="show === 'known'">
      <g v-for="(l, i) in knownLines" :key="l.k" class="scene-pop" :style="{ animationDelay: `${i * 0.25}s` }">
        <rect v-if="l.k === s.unknown" x="418" :y="110 + i * 56" width="204" height="40" rx="20" fill="#ffc93c" />
        <text x="520" :y="131 + i * 56" :font-size="fit(l.text, 22, 196)" font-weight="900" :fill="l.k === s.unknown ? '#18294a' : ink" text-anchor="middle" dominant-baseline="central">{{ l.text }}</text>
      </g>
    </g>
    <g v-if="show === 'formula'">
      <text x="520" y="160" :font-size="fit(formula.text, 30, 210)" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.3s">{{ formula.text }}</text>
      <text x="520" y="214" :font-size="fit(formula.numbers, 30, 210)" font-weight="900" fill="#f47a2a" text-anchor="middle" class="scene-pop" style="animation-delay: 0.7s">{{ formula.numbers }}</text>
    </g>

    <!-- the drive -->
    <g v-if="show === 'drive'">
      <g class="scene-pop" style="animation-delay: 0.2s">
        <rect :x="400 - answerW / 2" y="56" :width="answerW" height="54" rx="27" fill="#0f7f76" />
        <text x="400" y="84" :font-size="answerFont" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ answer }}</text>
      </g>
      <text v-if="hours" x="400" y="140" font-size="20" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.5s">{{ hours }}</text>
      <rect x="40" y="262" width="560" height="56" rx="10" :fill="grown ? '#3d4b5c' : '#5b6472'" />
      <line x1="48" y1="290" x2="592" y2="290" stroke="#fff" stroke-opacity="0.7" stroke-width="3" stroke-dasharray="16 14" />
      <rect :x="X0" y="304" :width="X1 - X0" height="6" rx="3" fill="#ffc93c">
        <animate attributeName="width" :values="`0;${X1 - X0};${X1 - X0}`" keyTimes="0;0.7;1" dur="4.5s" repeatCount="indefinite" />
      </rect>
      <g v-for="(m, i) in marks" :key="i" class="scene-pop" :style="{ animationDelay: `${0.3 + i * 0.12}s` }">
        <line :x1="m.x" y1="258" :x2="m.x" y2="322" :stroke="m.end ? '#f47a2a' : ink" :stroke-opacity="m.end ? 1 : 0.6" :stroke-width="m.end ? 4 : 2" />
        <text :x="m.x" y="248" :font-size="markFont(m)" :font-weight="m.end ? 900 : 700" :fill="m.end ? '#f47a2a' : ink" text-anchor="middle">{{ m.dist }}</text>
        <text :x="m.x" y="342" :font-size="markFont(m)" :font-weight="m.end ? 900 : 700" :fill="m.end ? '#f47a2a' : ink" text-anchor="middle">{{ m.time }}</text>
      </g>
      <text v-if="kid" x="592" y="372" font-size="26" text-anchor="middle">🏁</text>
      <g :transform="`translate(${X0} 286)`">
        <g>
          <animateMotion :path="`M0 0 H${X1 - X0}`" dur="4.5s" keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" repeatCount="indefinite" />
          <text v-if="kid" x="0" y="-4" font-size="46" text-anchor="middle" dominant-baseline="central" transform="scale(-1 1)">🚗</text>
          <g v-else>
            <rect x="-30" y="-16" width="60" height="20" rx="7" fill="#f47a2a" />
            <path d="M-17 -16 L-9 -29 L11 -29 L20 -16 Z" fill="#fff" fill-opacity="0.85" stroke="#f47a2a" stroke-width="3" stroke-linejoin="round" />
            <circle cx="-16" cy="5" r="7" fill="#18294a" stroke="#fff" stroke-width="2" />
            <circle cx="16" cy="5" r="7" fill="#18294a" stroke="#fff" stroke-width="2" />
          </g>
        </g>
      </g>
    </g>
  </svg>
</template>
