<script setup lang="ts">
// A teaching scene drawn like a tutor would on a whiteboard: wobbly outlines that draw
// themselves, then the shaded pieces fill in. Scenes are data from the engine.
import { computed } from 'vue'
import HandMath from './HandMath.vue'
import type { Piece, Visual } from '@/lib/types'

const props = withDefaults(defineProps<{ visual: Visual; compact?: boolean }>(), { compact: false })

const TONE = { pen: { stroke: '#1F5FD6', fill: '#5B8DEF', text: '#1F5FD6' }, marker: { stroke: '#D9601E', fill: '#F7934C', text: '#C2541A' } }
const RELATION = { '<': 'is smaller than', '>': 'is bigger than', '=': 'is the same as' }

const jitter = (seed: number, amp = 1.8) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * amp

function wobblyCircle(cx: number, cy: number, r: number, seed: number) {
  const pts = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2
    const rr = r + jitter(seed + i, 2.2)
    return `${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`
  })
  return `M${pts.join(' L')}`
}

function wedge(cx: number, cy: number, r: number, share: number) {
  if (share <= 0) return ''
  if (share >= 1) return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  const a = share * Math.PI * 2
  const x = cx + r * Math.sin(a)
  const y = cy - r * Math.cos(a)
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)} Z`
}

function slices(cx: number, cy: number, r: number, d: number, seed: number) {
  return Array.from({ length: d }, (_, i) => {
    const a = (i / d) * Math.PI * 2
    return `M${cx + jitter(seed + i, 1)} ${cy + jitter(seed - i, 1)} L${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}`
  }).join(' ')
}

function wobblyRect(x: number, y: number, w: number, h: number, seed: number) {
  const j = (k: number) => jitter(seed + k, 1.6)
  const corners = [
    [x + j(1), y + j(2)],
    [x + w + j(3), y + j(4)],
    [x + w + j(5), y + h + j(6)],
    [x + j(7), y + h + j(8)],
  ]
  return `M${corners.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L')} Z`
}

const pies = computed(() => {
  if (props.visual.kind !== 'compare_pies') return null
  const mk = (p: Piece, cx: number, seed: number) => ({ p, cx, outline: wobblyCircle(cx, 92, 64, seed), fill: wedge(cx, 92, 64, p.n / p.d), lines: slices(cx, 92, 64, p.d, seed), tone: TONE[p.tone] })
  return { left: mk(props.visual.left, 96, 3), right: mk(props.visual.right, 304, 11), relation: props.visual.relation }
})

const BAR_X = 70
const BAR_W = 320
const bars = computed(() => {
  if (props.visual.kind !== 'bar_model') return null
  let y = 6
  const rows = props.visual.rows.map((p, r) => {
    const noteY = p.note ? y + 18 : null
    if (p.note) y += 30
    const row = {
      p,
      y,
      noteY,
      tone: TONE[p.tone],
      cells: Array.from({ length: p.d }, (_, i) => ({ x: BAR_X + (BAR_W / p.d) * i, w: BAR_W / p.d, filled: i < p.n, path: wobblyRect(BAR_X + (BAR_W / p.d) * i, y, BAR_W / p.d, 38, r * 31 + i) })),
    }
    y += 58
    return row
  })
  return { rows, height: y }
})
</script>

<template>
  <svg v-if="pies" viewBox="0 0 400 200" class="w-full" :class="compact ? 'max-w-[300px]' : 'max-w-[440px]'" role="img" :aria-label="`${pies.left.p.label} ${RELATION[pies.relation]} ${pies.right.p.label}`">
    <g v-for="(pie, k) in [pies.left, pies.right]" :key="k">
      <path :d="pie.fill" :fill="pie.tone.fill" opacity="0.85" class="svg-center" :style="{ animation: `pop 600ms cubic-bezier(0.3,1.5,0.5,1) ${0.6 + k * 0.5}s both` }" />
      <path :d="pie.lines" fill="none" stroke="#fff" stroke-width="3" class="svg-center" :style="{ animation: `pop 400ms ${0.9 + k * 0.5}s both` }" />
      <path :d="pie.outline" pathLength="1" class="draw" :style="{ '--dur': '0.8s', '--delay': `${k * 0.5}s` }" fill="none" :stroke="pie.tone.stroke" stroke-width="3.5" stroke-linejoin="round" />
      <text :x="pie.cx" y="190" text-anchor="middle" class="font-marker" font-size="25" font-weight="700" :fill="pie.tone.text" :style="{ animation: `rise 500ms ${1.1 + k * 0.4}s both` }">{{ pie.p.label }}</text>
    </g>
    <text x="200" y="112" text-anchor="middle" class="font-marker svg-center" font-size="66" font-weight="700" fill="#18294A" style="animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) 1.6s both">{{ pies.relation }}</text>
  </svg>

  <svg v-else-if="bars" :viewBox="`0 0 400 ${bars.height}`" class="w-full" :class="compact ? 'max-w-[300px]' : 'max-w-[440px]'" role="img" :aria-label="visual.kind === 'bar_model' ? visual.rows.map((r) => `${r.label}: ${r.n} of ${r.d} pieces shaded`).join(', ') : ''">
    <g v-for="(row, r) in bars.rows" :key="r">
      <text v-if="row.noteY !== null" :x="BAR_X" :y="row.noteY" class="font-marker" font-size="21" font-weight="700" fill="#C2541A" :style="{ animation: `rise 500ms ${r * 0.45}s both` }">↓ {{ row.p.note }}</text>
      <text x="56" :y="row.y + 28" text-anchor="end" class="font-marker" font-size="27" font-weight="700" :fill="row.tone.text" :style="{ animation: `rise 400ms ${r * 0.45}s both` }">{{ row.p.label }}</text>
      <rect
        v-for="(c, i) in row.cells.filter((x) => x.filled)"
        :key="`f${i}`"
        :x="c.x + 2.5"
        :y="row.y + 2.5"
        :width="c.w - 5"
        height="33"
        rx="3"
        :fill="row.tone.fill"
        opacity="0.85"
        style="transform-box: fill-box; transform-origin: left"
        :style="{ animation: `rise 380ms ${r * 0.45 + 0.5 + i * 0.07}s both` }"
      />
      <path
        v-for="(c, i) in row.cells"
        :key="`o${i}`"
        :d="c.path"
        pathLength="1"
        class="draw"
        :style="{ '--dur': '0.45s', '--delay': `${r * 0.45 + i * 0.03}s` }"
        fill="none"
        :stroke="row.tone.stroke"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
    </g>
  </svg>

  <figure v-else-if="visual.kind === 'worked'" class="m-0 flex flex-col items-start gap-3">
    <figcaption class="font-marker text-[22px] font-bold text-[#C2541A]">{{ visual.caption }}</figcaption>
    <HandMath v-for="(line, i) in visual.lines" :key="i" :latex="line" :size="compact ? 28 : 36" :delay="i * 0.9" />
  </figure>
</template>
