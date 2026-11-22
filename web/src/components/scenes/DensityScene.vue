<script setup lang="ts">
// Density: a block with its mass and its volume; mass ÷ volume is how heavy each cm³ is; that
// next to the liquid's density on a scale; then the block dropped in a tank: it floats (as much
// of it under the surface as its density is of the liquid's), sinks, or hangs in the middle.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { mass: number; volume: number; rho: number; liquid: string; liquidRho: number; verdict: 'floats' | 'sinks' | 'neither' })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'formula'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const tank = computed(() => show.value === 'tank')

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

const LIQUID: Record<string, string> = { water: '#4aa8ff', 'sea water': '#1d8fb8', oil: '#e9b949' }
const liquidColor = computed(() => LIQUID[s.value.liquid] ?? '#4aa8ff')
const liquidName = computed(() => String(s.value.liquid ?? 'water'))
const sym = computed(() => (s.value.verdict === 'floats' ? '<' : s.value.verdict === 'sinks' ? '>' : '='))
const VERDICT = { floats: 'it floats!', sinks: 'it sinks', neither: 'it stays put' }
const verdictColor = computed(() => (s.value.verdict === 'floats' ? (grown.value ? '#3fe0d0' : '#0f7f76') : s.value.verdict === 'sinks' ? '#f47a2a' : grown.value ? '#b9a6ff' : '#7c5ce8'))
const why = computed(() => (s.value.verdict === 'floats' ? `lighter than ${liquidName.value}` : s.value.verdict === 'sinks' ? `heavier than ${liquidName.value}` : `as dense as ${liquidName.value}`))

// the labels beside the block
const massText = computed(() => (grown.value ? `m = ${fmt(s.value.mass)} g` : `mass: ${fmt(s.value.mass)} g`))
const volText = computed(() => (grown.value ? `V = ${fmt(s.value.volume)} cm³` : `volume: ${fmt(s.value.volume)} cm³`))
const formulaText = computed(() => (grown.value ? 'ρ = m ÷ V' : 'density = mass ÷ volume'))
const division = computed(() => `${fmt(s.value.mass)} g ÷ ${fmt(s.value.volume)} cm³`)
const rhoText = computed(() => `= ${fmt(s.value.rho)} g/cm³`)
const compareText = computed(() => `${fmt(s.value.rho)} ${sym.value} ${fmt(s.value.liquidRho)}`)

// the block (front face B × B, centred on its place), beside the sums or in the tank
const B = 96
const TANK = { x0: 70, x1: 370, top: 96, bottom: 360, surface: 168 }
const blockAt = computed(() => {
  if (!tank.value) return { x: 150, y: 150 }
  const x = (TANK.x0 + TANK.x1) / 2 - 11
  if (s.value.verdict === 'sinks') return { x, y: TANK.bottom - 6 - B / 2 }
  if (s.value.verdict === 'neither') return { x, y: (TANK.surface + TANK.bottom) / 2 }
  // floating: the part under the surface is rho / liquidRho of its height
  const f = Math.min(0.95, Math.max(0.05, s.value.rho / s.value.liquidRho || 0))
  return { x, y: TANK.surface - B / 2 + B * f }
})

// the density scale: 0 to a bit more than the bigger of the two
const SX0 = 60
const SX1 = 600
const scaleMax = computed(() => Math.max(s.value.rho || 0, s.value.liquidRho || 1) * 1.35)
const sx = (v: number) => SX0 + (Math.max(0, Math.min(v, scaleMax.value)) / scaleMax.value) * (SX1 - SX0)
const clampX = (x: number, text: string, f: number) => {
  const half = (text.length * 0.6 * f) / 2
  return Math.max(16 + half, Math.min(624 - half, x))
}
const blockLabel = computed(() => `${kid.value ? 'block' : 'ρ'} ${fmt(s.value.rho)}`)
const liquidLabel = computed(() => `${liquidName.value} ${fmt(s.value.liquidRho)}`)

const WAVE = ['M72 168 Q109 161 146 168 T220 168 T294 168 T368 168', 'M72 168 Q109 175 146 168 T220 168 T294 168 T368 168']
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`density ${fmt(s.rho)} grams per cubic centimetre: ${VERDICT[s.verdict] ?? ''}`">
    <!-- the tank, behind the block -->
    <rect v-if="tank" :x="TANK.x0" :y="TANK.top" :width="TANK.x1 - TANK.x0" :height="TANK.bottom - TANK.top" rx="8" :fill="grown ? '#ffffff10' : '#ffffff80'" class="scene-pop" />

    <!-- the block -->
    <g :style="{ transform: `translate(${blockAt.x}px, ${blockAt.y}px)`, transition: 'transform 1.4s cubic-bezier(0.5, 0, 0.45, 1.25)' }">
      <g class="scene-pop">
        <g>
        <animateTransform v-if="tank && s.verdict === 'floats'" attributeName="transform" type="translate" values="0 0;0 4;0 0" dur="2.6s" repeatCount="indefinite" />
        <rect :x="-B / 2" :y="-B / 2" :width="B" :height="B" rx="4" fill="#7c5ce8" />
        <polygon :points="`${-B / 2},${-B / 2} ${-B / 2 + 22},${-B / 2 - 16} ${B / 2 + 22},${-B / 2 - 16} ${B / 2},${-B / 2}`" fill="#a891f2" />
        <polygon :points="`${B / 2},${-B / 2} ${B / 2 + 22},${-B / 2 - 16} ${B / 2 + 22},${B / 2 - 16} ${B / 2},${B / 2}`" fill="#5a3fc4" />
        <!-- in little cubes: each cm³ weighs rho grams -->
        <g v-if="show === 'compute'">
          <path v-for="k in 3" :key="k" :d="`M${-B / 2 + k * (B / 4)} ${-B / 2} V${B / 2} M${-B / 2} ${-B / 2 + k * (B / 4)} H${B / 2}`" pathLength="1" stroke="#fff" stroke-opacity="0.6" stroke-width="2" fill="none" class="scene-draw" :style="{ animationDelay: `${k * 0.15}s` }" />
          <rect :x="-B / 2 + 2" :y="-B / 2 + 2" :width="B / 4 - 4" :height="B / 4 - 4" rx="3" fill="#ffc93c" class="scene-pop" style="animation-delay: 0.8s" />
        </g>
        <g v-if="kid && show !== 'compute'">
          <circle cx="-17" cy="-8" r="8" fill="#fff" />
          <circle cx="17" cy="-8" r="8" fill="#fff" />
          <circle cx="-15" cy="-6" r="4" fill="#18294a" />
          <circle cx="19" cy="-6" r="4" fill="#18294a" />
          <path :d="s.verdict === 'sinks' && tank ? 'M-10 22 Q0 12 10 22' : 'M-16 14 Q0 30 16 14'" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" />
        </g>
        </g>
      </g>
    </g>

    <!-- the liquid, over the part of the block under the surface -->
    <g v-if="tank">
      <rect :x="TANK.x0 + 2" :y="TANK.surface" :width="TANK.x1 - TANK.x0 - 4" :height="TANK.bottom - TANK.surface - 2" :fill="liquidColor" fill-opacity="0.55" class="scene-pop" />
      <path :d="WAVE[0]" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="3">
        <animate attributeName="d" :values="`${WAVE[0]};${WAVE[1]};${WAVE[0]}`" dur="2.4s" repeatCount="indefinite" />
      </path>
      <circle v-for="(b, i) in [{ x: 110, d: 0 }, { x: 326, d: 1.1 }, { x: 346, d: 2.2 }]" :key="i" :cx="b.x" cy="340" r="4" fill="#fff" fill-opacity="0.7">
        <animate attributeName="cy" values="352;176" dur="3.3s" :begin="`${-b.d}s`" repeatCount="indefinite" />
      </circle>
      <text v-if="kid && s.verdict === 'floats' && liquidName !== 'oil'" x="330" y="326" font-size="26" text-anchor="middle" dominant-baseline="central">🐟<animateMotion path="M0 0 H-220" dur="7s" repeatCount="indefinite" /></text>
      <text :x="(TANK.x0 + TANK.x1) / 2" :y="TANK.bottom + 26" font-size="17" font-weight="900" :fill="grown ? liquidColor : '#1d6fb8'" text-anchor="middle">{{ liquidName }}</text>
      <path :d="`M${TANK.x0} ${TANK.top} V${TANK.bottom - 8} Q${TANK.x0} ${TANK.bottom} ${TANK.x0 + 8} ${TANK.bottom} H${TANK.x1 - 8} Q${TANK.x1} ${TANK.bottom} ${TANK.x1} ${TANK.bottom - 8} V${TANK.top}`" fill="none" :stroke="ink" stroke-opacity="0.8" stroke-width="4" stroke-linejoin="round" />
    </g>

    <!-- mass and volume under the block -->
    <g v-if="!tank">
      <text x="160" y="240" :font-size="fit(massText, 20, 270)" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.3s">{{ kid ? '⚖️ ' : '' }}{{ massText }}</text>
      <text x="160" y="268" :font-size="fit(volText, 20, 270)" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.5s">{{ kid ? '📦 ' : '' }}{{ volText }}</text>
      <text v-if="show === 'compute'" x="160" y="296" :font-size="fit(`1 cm³ weighs ${fmt(s.rho)} g`, 17, 270)" font-weight="900" fill="#e0a21a" text-anchor="middle" class="scene-pop" style="animation-delay: 1s">1 cm³ weighs {{ fmt(s.rho) }} g</text>
    </g>

    <!-- the sums, beside it -->
    <g v-if="!tank">
      <text x="470" y="104" :font-size="fit(formulaText, grown ? 32 : 24, 280)" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop">{{ formulaText }}</text>
      <template v-if="show !== 'formula'">
        <text x="470" y="158" :font-size="fit(division, 26, 280)" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.2s">{{ division }}</text>
        <text x="470" y="210" :font-size="fit(rhoText, 32, 280)" font-weight="900" :fill="grown ? '#b9a6ff' : '#7c5ce8'" text-anchor="middle" class="scene-pop" style="animation-delay: 0.6s">{{ rhoText }}</text>
      </template>
      <text v-if="show === 'compare'" x="470" y="268" :font-size="fit(compareText, 32, 280)" font-weight="900" :fill="verdictColor" text-anchor="middle" class="scene-pop" style="animation-delay: 0.6s">{{ compareText }}</text>
    </g>

    <!-- the density scale: lighter than the liquid floats, heavier sinks -->
    <g v-if="show === 'compare'" class="scene-pop" style="animation-delay: 0.2s">
      <rect :x="SX0" y="328" :width="sx(s.liquidRho) - SX0" height="22" rx="4" :fill="liquidColor" fill-opacity="0.45" />
      <rect :x="sx(s.liquidRho)" y="328" :width="SX1 - sx(s.liquidRho)" height="22" rx="4" fill="#f47a2a" fill-opacity="0.3" />
      <text v-if="sx(s.liquidRho) - SX0 > 70" :x="(SX0 + sx(s.liquidRho)) / 2" y="344" font-size="13" font-weight="800" :fill="ink" text-anchor="middle">floats</text>
      <text v-if="SX1 - sx(s.liquidRho) > 70" :x="(SX1 + sx(s.liquidRho)) / 2" y="344" font-size="13" font-weight="800" :fill="ink" text-anchor="middle">sinks</text>
      <text v-if="clampX(sx(s.liquidRho), liquidLabel, 15) - (liquidLabel.length * 0.6 * 15) / 2 > SX0 + 14" :x="SX0" y="380" font-size="13" font-weight="700" :fill="ink" fill-opacity="0.6" text-anchor="middle">0</text>
      <line :x1="sx(s.liquidRho)" y1="322" :x2="sx(s.liquidRho)" y2="358" :stroke="liquidColor" stroke-width="4" />
      <text :x="clampX(sx(s.liquidRho), liquidLabel, 15)" y="380" font-size="15" font-weight="900" :fill="grown ? liquidColor : '#1d6fb8'" text-anchor="middle">{{ liquidLabel }}</text>
    </g>
    <g v-if="show === 'compare'" class="scene-pop" style="animation-delay: 0.7s">
      <polygon :points="`${sx(s.rho)},326 ${sx(s.rho) - 9},312 ${sx(s.rho) + 9},312`" fill="#7c5ce8" />
      <text :x="clampX(sx(s.rho), blockLabel, 15)" y="304" font-size="15" font-weight="900" :fill="grown ? '#b9a6ff' : '#7c5ce8'" text-anchor="middle">{{ blockLabel }}</text>
    </g>

    <!-- what happens -->
    <g v-if="tank">
      <text x="505" y="150" :font-size="fit(compareText, 30, 220)" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.6s">{{ compareText }}</text>
      <text x="505" y="204" :font-size="fit(VERDICT[s.verdict] ?? '', 34, 230)" font-weight="900" :fill="verdictColor" text-anchor="middle" class="scene-pop" style="animation-delay: 1.2s">{{ VERDICT[s.verdict] ?? '' }}</text>
      <text x="505" y="238" :font-size="fit(why, 18, 230)" font-weight="700" :fill="ink" fill-opacity="0.75" text-anchor="middle" class="scene-pop" style="animation-delay: 1.4s">{{ why }}</text>
      <text v-if="kid" x="505" y="300" font-size="44" text-anchor="middle" class="scene-hop" style="animation-delay: 1.6s">{{ s.verdict === 'floats' ? '⛵' : s.verdict === 'sinks' ? '⚓' : '🤿' }}</text>
    </g>
  </svg>
</template>
