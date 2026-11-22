<script setup lang="ts">
// A food chain: the living things in a row (two rows, snaking, when there are many), then
// each arrow from the food to its eater drawing itself with the energy flowing along it, then
// what each one is: producer, consumers, top predator.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

interface Item {
  name: string
  role: string
  emoji: string | null
}
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { items: Item[] })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'start'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))

const items = computed(() => (Array.isArray(s.value.items) ? s.value.items.slice(0, 8) : []))
const n = computed(() => items.value.length)
// the link being told (link0, link1...), every link at the end
const active = computed(() => (/^link\d+$/.test(show.value) ? Number(show.value.slice(4)) : show.value === 'roles' ? n.value : -1))
const roles = computed(() => show.value === 'roles')

const ROLE: Record<string, [string, string]> = {
  'energy source': ['#e0a21a', '#ffc93c'],
  producer: ['#1d8a5b', '#4fd18b'],
  'primary consumer': ['#1f5fd6', '#8fb8ff'],
  'secondary consumer': ['#7c5ce8', '#b9a6ff'],
  'tertiary consumer': ['#e06514', '#ff9a52'],
  consumer: ['#0f7f76', '#3fe0d0'],
  'top predator': ['#d23a40', '#ff7a7e'],
}
const roleColor = (role: string) => (ROLE[role] ?? ['#18294a', '#ffffff'])[grown.value ? 1 : 0]
const fallback = (role: string) => (role === 'energy source' ? '☀️' : role === 'producer' ? '🌱' : '🐾')

// the places: one row up to 4, otherwise two rows, the second going back from the right
const layout = computed(() => {
  const count = n.value
  const two = count > 4
  const m1 = two ? Math.ceil(count / 2) : count
  const sp = m1 >= 4 ? 140 : 150
  const xs = Array.from({ length: m1 }, (_, j) => 320 + (j - (m1 - 1) / 2) * sp)
  const ys = kid.value ? (two ? [92, 258] : [160, 160]) : two ? [112, 276] : [180, 180]
  const half = kid.value ? 34 : (sp - 46) / 2
  const nodes = items.value.map((it, i) => {
    const row = i < m1 ? 0 : 1
    const x = row === 0 ? xs[i] : xs[m1 - 1 - (i - m1)]
    return { i, it, x, y: ys[row], row }
  })
  return { nodes, sp, half, m1 }
})
// a name on one line, or two when it is long and has a space
const lines = (name: string) => {
  const t = String(name)
  if (t.length <= 11 || !t.includes(' ')) return [t]
  const mid = t.length / 2
  const cut = [...t.matchAll(/ /g)].map((m) => m.index ?? 0).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]
  return [t.slice(0, cut), t.slice(cut + 1)]
}
const nameFont = (name: string, width: number, max: number) => Math.min(max, width / (Math.max(...lines(name).map((l) => l.length), 1) * 0.6))
const roleLines = (role: string) => (role.includes(' ') ? [role.slice(0, role.indexOf(' ')), role.slice(role.indexOf(' ') + 1)] : [role])

// the arrow from item i to item i+1 (along the row, or round the corner to the second row)
const arrows = computed(() => {
  const { nodes, half } = layout.value
  return nodes.slice(0, -1).map((a, i) => {
    const b = nodes[i + 1]
    let d: string
    let start: [number, number]
    let tip: [number, number]
    let from: [number, number]
    if (a.row === b.row) {
      const dir = b.x > a.x ? 1 : -1
      start = [a.x + dir * (half + 8), a.y]
      tip = [b.x - dir * (half + 8), b.y]
      from = start
      d = `M${start[0]} ${start[1]} L${tip[0]} ${tip[1]}`
    } else {
      const x = a.x + half + 6
      start = [x, a.y]
      tip = [x, b.y]
      from = [x + 44, b.y]
      d = `M${x} ${a.y} C${x + 44} ${a.y} ${x + 44} ${b.y} ${x} ${b.y}`
    }
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0])
    const head = [tip, [tip[0] - 14 * Math.cos(ang - 0.45), tip[1] - 14 * Math.sin(ang - 0.45)], [tip[0] - 14 * Math.cos(ang + 0.45), tip[1] - 14 * Math.sin(ang + 0.45)]]
    // the same curve, relative to its start, for the energy dots to follow
    const rel = d.replace(/-?\d+(\.\d+)?/g, (v, _f, off: number) => {
      const before = d.slice(0, off).match(/-?\d+(\.\d+)?/g)?.length ?? 0
      return String(Math.round((Number(v) - (before % 2 ? start[1] : start[0])) * 10) / 10)
    })
    return { i, d, rel, start, head: head.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') }
  })
})
const dim = (i: number) => active.value >= 0 && !roles.value && i > active.value + 1
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`Food chain: ${items.map((x) => x.name).join(' to ')}`">
    <!-- the arrows: the food's energy goes to its eater -->
    <g v-for="a in arrows" :key="a.i">
      <template v-if="a.i <= active">
        <path :key="`p${a.i}-${a.i === active ? show : 'done'}`" :d="a.d" pathLength="1" fill="none" :stroke="a.i === active ? '#f47a2a' : ink" :stroke-opacity="a.i === active ? 1 : 0.55" stroke-width="5" stroke-linecap="round" :class="a.i === active ? 'scene-draw' : ''" :style="{ animationDuration: '0.9s' }" />
        <polygon :key="`h${a.i}-${a.i === active ? show : 'done'}`" :points="a.head" :fill="a.i === active ? '#f47a2a' : ink" :fill-opacity="a.i === active ? 1 : 0.55" :class="a.i === active ? 'scene-pop' : ''" style="animation-delay: 0.75s" />
        <!-- energy flowing along it -->
        <g v-if="a.i === active || roles">
          <circle v-for="k in 3" :key="k" :cx="a.start[0]" :cy="a.start[1]" :r="roles ? 4 : 6" fill="#ffc93c" :stroke="grown ? 'none' : '#e0a21a'" stroke-width="1.5">
            <animateMotion :path="a.rel" :dur="roles ? '2s' : '1.3s'" :begin="`${(-(k - 1) * (roles ? 2 : 1.3)) / 3}s`" repeatCount="indefinite" />
          </circle>
        </g>
      </template>
    </g>

    <!-- the living things -->
    <g v-for="nd in layout.nodes" :key="nd.i" :style="{ opacity: dim(nd.i) ? 0.4 : 1, transition: 'opacity 500ms' }">
      <g class="scene-pop" :style="{ animationDelay: `${nd.i * 0.15}s` }">
        <template v-if="kid">
          <circle :cx="nd.x" :cy="nd.y" r="34" fill="#fff" :stroke="roles ? roleColor(nd.it.role) : '#c9d6e3'" :stroke-width="roles ? 5 : 3" style="transition: stroke 500ms" />
          <text :key="`e${nd.i}-${nd.i === active + 1 ? show : ''}`" :x="nd.x" :y="nd.y + 2" font-size="38" text-anchor="middle" dominant-baseline="central" :class="nd.i === active + 1 && !roles ? 'scene-hop' : ''" style="animation-delay: 0.8s">{{ nd.it.emoji || fallback(nd.it.role) }}</text>
          <text v-for="(l, j) in lines(nd.it.name)" :key="j" :x="nd.x" :y="nd.y + 56 + j * 18" :font-size="nameFont(nd.it.name, layout.sp - 14, 17)" font-weight="900" :fill="ink" text-anchor="middle">{{ l }}</text>
        </template>
        <template v-else>
          <rect :x="nd.x - layout.half" :y="nd.y - 25" :width="2 * layout.half" height="50" rx="12" :fill="nd.it.role === 'energy source' ? '#ffc93c' : grown ? '#ffffff14' : '#fff'" :stroke="roles ? roleColor(nd.it.role) : ink" :stroke-opacity="roles ? 1 : 0.3" :stroke-width="roles ? 4 : 2" style="transition: stroke 500ms" />
          <text v-for="(l, j) in lines(nd.it.name)" :key="j" :x="nd.x" :y="nd.y + (lines(nd.it.name).length > 1 ? -4 + j * 18 : 6)" :font-size="nameFont(nd.it.name, 2 * layout.half - 12, lines(nd.it.name).length > 1 ? 15 : 17)" font-weight="900" :fill="nd.it.role === 'energy source' ? '#18294a' : ink" text-anchor="middle">{{ l }}</text>
        </template>
      </g>
      <!-- its role -->
      <g v-if="roles" class="scene-pop" :style="{ animationDelay: `${0.2 + nd.i * 0.2}s` }">
        <text v-for="(l, j) in roleLines(nd.it.role)" :key="j" :x="nd.x" :y="(kid ? nd.y + 56 + lines(nd.it.name).length * 18 + 4 : nd.y + 47) + j * 16" font-size="14" font-weight="900" :fill="roleColor(nd.it.role)" text-anchor="middle">{{ l }}</text>
      </g>
    </g>
  </svg>
</template>
