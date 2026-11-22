<script setup lang="ts">
// States of matter: a thermometer with the melting and boiling marks (solid below, liquid between,
// gas above), the level rising to the temperature, then a box of particles in that state: a
// solid's grid wiggling in place, a liquid's packed particles sliding, a gas's few flying fast
// (melting and boiling: a mix of the two).
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type State = 'solid' | 'liquid' | 'gas' | 'melting' | 'boiling'
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { substance: string; T: number; melt: number; boil: number | null; state: State; names: Record<string, string> | null })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'thermometer'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))

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
const deg = (v: number) => `${fmt(v)} °C`

const boil = computed(() => (typeof s.value.boil === 'number' && Number.isFinite(s.value.boil) ? s.value.boil : null))
// melting and boiling at the same temperature: it goes straight from solid to gas
const sublimes = computed(() => boil.value !== null && boil.value === s.value.melt)
const name = computed(() => String(s.value.substance ?? ''))
const title = computed(() => `${name.value.charAt(0).toUpperCase()}${name.value.slice(1)}`)
const LOOK: Record<string, string> = { water: '💧', chocolate: '🍫', butter: '🧈', wax: '🕯️', gold: '🪙', salt: '🧂', iron: '🔩', copper: '🥉', aluminium: '🥫', mercury: '🌡️', ethanol: '🧪', oxygen: '🫧', nitrogen: '🫧', 'carbon dioxide': '🫧' }
const SOLID: Record<string, string> = { water: '🧊', chocolate: '🍫', butter: '🧈', wax: '🕯️', gold: '🪙', salt: '🧂', iron: '🔩' }
const ICON = computed<Record<string, string>>(() => ({ solid: SOLID[name.value] ?? '🧱', liquid: '💧', gas: '💨', melting: '🫠', boiling: '♨️' }))
const COLOR: Record<string, string> = { water: '#4aa8ff', iron: '#8a97ab', gold: '#e0a21a', copper: '#c8743a', aluminium: '#9fb0c4', lead: '#6b7a90', mercury: '#a3adb9', salt: '#c9d6e3', ethanol: '#7c5ce8', oxygen: '#4aa8ff', nitrogen: '#7c5ce8', 'carbon dioxide': '#8a97ab', chocolate: '#8a5a3c', butter: '#f2c94c', wax: '#f4a26b' }
const dot = computed(() => COLOR[name.value] ?? '#7c5ce8')
const word = (st: string) => (kid.value && s.value.names?.[st] ? s.value.names[st] : st)

// the scale of the thermometer: the two marks and the temperature, with room around them
const range = computed(() => {
  const pts = [s.value.melt, s.value.T, ...(boil.value !== null ? [boil.value] : [s.value.melt + 20])]
  const lo0 = Math.min(...pts)
  const hi0 = Math.max(...pts)
  const span = Math.max(hi0 - lo0, 20)
  return { lo: lo0 - span * 0.2, hi: hi0 + span * 0.2 }
})
const Y0 = 320
const Y1 = 50
const y = (v: number) => Y0 - ((v - range.value.lo) / (range.value.hi - range.value.lo)) * (Y0 - Y1)
const level = computed(() => (show.value === 'thermometer' ? Y0 : y(s.value.T)))
const bands = computed(() => {
  const m = y(s.value.melt)
  const b = boil.value !== null ? y(boil.value) : null
  const out: { key: string; from: number; to: number; fill: string; label: string }[] = [{ key: 'solid', from: m, to: 330, fill: '#9fd3ff', label: word('solid') }]
  if (!sublimes.value) out.push({ key: 'liquid', from: b ?? 36, to: m, fill: '#4aa8ff', label: word('liquid') })
  if (b !== null) out.push({ key: 'gas', from: 36, to: b, fill: '#ffc93c', label: word('gas') })
  return out
})
const marks = computed(() => {
  if (sublimes.value) return [{ key: 'm', y: y(s.value.melt), text: `solid ↔ gas ${deg(s.value.melt)}`, short: deg(s.value.melt), color: grown.value ? '#b9a6ff' : '#7c5ce8', below: false }]
  const out = [{ key: 'm', y: y(s.value.melt), text: `melts ${deg(s.value.melt)}`, short: `melts ${deg(s.value.melt)}`, color: grown.value ? '#8fd0ff' : '#1d6fb8', below: true }]
  if (boil.value !== null) out.push({ key: 'b', y: y(boil.value), text: `boils ${deg(boil.value)}`, short: `boils ${deg(boil.value)}`, color: '#f47a2a', below: false })
  return out
})
const tText = computed(() => deg(s.value.T))
const compare = computed(() => {
  const { T, melt } = s.value
  const b = boil.value
  if (T < melt) return `colder than ${deg(melt)}`
  if (b !== null && T > b) return `hotter than ${deg(b)}`
  if (T === melt || T === b) return 'right at the change'
  return b === null ? `warmer than ${deg(melt)}` : `between ${fmt(melt)} and ${deg(b)}`
})

// the particles, placed by a fixed pseudo-random sequence (the same picture every time)
const BOX = { x0: 408, x1: 620, y0: 70, y1: 320 }
interface Particle {
  k: number
  x: number
  y: number
  r: number
  kind: 'wiggle' | 'slide' | 'fly'
  d: string
  dur: number
  begin: number
}
const particles = computed<Particle[]>(() => {
  let seed = 20240611
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const out: Particle[] = []
  const add = (x: number, y0: number, kind: Particle['kind'], r = 9) => {
    let d = ''
    let dur = 0
    if (kind === 'slide') {
      const a = [rnd() * 24 - 12, rnd() * 10 - 5]
      const b = [rnd() * 24 - 12, rnd() * 10 - 5]
      d = `M0 0 L${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)} Z`
      dur = 2.4 + rnd() * 1.6
    } else if (kind === 'fly') {
      // a few far corners of the box, visited fast
      const pts = Array.from({ length: 4 }, () => [BOX.x0 + 14 + rnd() * (BOX.x1 - BOX.x0 - 28) - x, BOX.y0 + 14 + rnd() * (BOX.y1 - BOX.y0 - 28) - y0])
      d = `M0 0 ${pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} Z`
      dur = 1.6 + rnd() * 1.2
    } else dur = 0.45 + rnd() * 0.3
    out.push({ k: out.length, x, y: y0, r, kind, d, dur, begin: -rnd() * 3 })
  }
  const grid = (cols: number, rows: number, cx: number, bottom: number) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(cx + (c - (cols - 1) / 2) * 22, bottom - r * 22, 'wiggle')
  }
  const pool = (cols: number, rows: number, x0: number, bottom: number, gap = 23) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (rnd() > 0.12) add(x0 + c * gap + (r % 2) * 9 + rnd() * 5 - 2.5, bottom - r * 20 + rnd() * 5 - 2.5, 'slide')
  }
  const gas = (n: number, top: number, bottom: number) => {
    for (let i = 0; i < n; i++) add(BOX.x0 + 20 + rnd() * (BOX.x1 - BOX.x0 - 40), top + rnd() * (bottom - top), 'fly', 8)
  }
  const st = s.value.state
  if (st === 'solid') grid(7, 7, 514, 302)
  else if (st === 'liquid') pool(8, 6, 428, 302)
  else if (st === 'gas') gas(12, BOX.y0 + 20, BOX.y1 - 20)
  else if (st === 'melting') {
    grid(3, 6, 450, 302)
    pool(4, 4, 500, 302, 24)
  } else {
    pool(8, 3, 428, 302)
    gas(7, BOX.y0 + 20, 220)
  }
  return out
})
const stateWord = computed(() => `${kid.value ? `${ICON.value[s.value.state] ?? ''} ` : ''}${s.value.state}`)
const stateSub = computed(() => {
  const st = s.value.state
  if (st === 'melting') return 'solid turning to liquid'
  if (st === 'boiling') return 'liquid turning to gas'
  return s.value.names?.[st] ? `(${s.value.names[st]})` : ''
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${title} at ${tText}: ${s.state}`">
    <!-- solid, liquid and gas, along the thermometer -->
    <g v-for="b in bands" :key="b.key" class="scene-pop">
      <rect x="40" :y="b.from" width="260" :height="Math.max(0, b.to - b.from)" :fill="b.fill" :fill-opacity="grown ? 0.16 : 0.32" />
      <text v-if="b.to - b.from >= 26" x="48" :y="(b.from + b.to) / 2 + 6" :font-size="fit(`${kid ? 'xx' : ''}${b.label}`, 16, 104)" font-weight="900" :fill="ink" fill-opacity="0.8">{{ kid ? `${ICON[b.key]} ` : '' }}{{ b.label }}</text>
    </g>
    <g v-for="(m, i) in marks" :key="m.key" class="scene-pop" :style="{ animationDelay: `${0.3 + i * 0.2}s` }">
      <line x1="40" :y1="m.y" x2="300" :y2="m.y" :stroke="m.color" stroke-width="3" stroke-dasharray="8 6" />
      <text x="296" :y="m.below ? m.y + 17 : m.y - 6" :font-size="fit(m.short, 14, 106)" font-weight="900" :fill="m.color" text-anchor="end">{{ m.short }}</text>
    </g>

    <!-- the thermometer -->
    <rect x="158" y="36" width="24" height="300" rx="12" :fill="grown ? '#1b3240' : '#fff'" :stroke="ink" stroke-opacity="0.7" stroke-width="3" />
    <rect x="164" :y="level" width="12" :height="Math.max(0, 346 - level)" rx="6" fill="#e5484d" style="transition: y 1.4s cubic-bezier(0.3, 1.1, 0.5, 1), height 1.4s cubic-bezier(0.3, 1.1, 0.5, 1)" />
    <circle cx="170" cy="348" r="22" fill="#e5484d" :stroke="ink" stroke-opacity="0.7" stroke-width="3" />
    <g v-if="show !== 'thermometer'" :key="`t${show}`" class="scene-pop" style="animation-delay: 1s">
      <polygon :points="`302,${y(s.T)} 316,${y(s.T) - 9} 316,${y(s.T) + 9}`" fill="#e5484d" />
      <text x="320" :y="y(s.T) + 8" :font-size="fit(tText, 24, 84)" font-weight="900" fill="#e5484d">{{ tText }}</text>
    </g>

    <!-- the substance -->
    <text x="514" :y="show === 'particles' ? 48 : 70" :font-size="fit(title, 28, 200)" font-weight="900" :fill="ink" text-anchor="middle" style="transition: y 600ms">{{ title }}</text>
    <g v-if="show === 'thermometer'">
      <text v-if="kid" x="514" y="150" font-size="56" text-anchor="middle" class="scene-pop">{{ LOOK[name] ?? '🧪' }}</text>
      <text v-for="(m, i) in marks" :key="m.key" x="514" :y="(kid ? 210 : 140) + i * 34" :font-size="fit(m.text, 20, 210)" font-weight="800" :fill="m.color" text-anchor="middle" class="scene-pop" :style="{ animationDelay: `${0.4 + i * 0.2}s` }">{{ m.text }}</text>
    </g>
    <g v-if="show === 'temperature'">
      <text x="514" y="200" :font-size="fit(tText, 52, 200)" font-weight="900" fill="#e5484d" text-anchor="middle" class="scene-pop" style="animation-delay: 0.8s">{{ tText }}</text>
      <text x="514" y="244" :font-size="fit(compare, 19, 210)" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 1.3s">{{ compare }}</text>
      <text v-if="kid" x="514" y="310" font-size="44" text-anchor="middle" class="scene-hop" style="animation-delay: 1.5s">{{ s.T < s.melt ? '🥶' : boil !== null && s.T >= boil ? '🥵' : '🙂' }}</text>
    </g>

    <!-- the particles -->
    <g v-if="show === 'particles'">
      <rect :x="BOX.x0" :y="BOX.y0" :width="BOX.x1 - BOX.x0" :height="BOX.y1 - BOX.y0" rx="14" :fill="grown ? '#ffffff10' : '#ffffffa6'" :stroke="ink" stroke-opacity="0.4" stroke-width="3" class="scene-pop" />
      <g v-for="p in particles" :key="p.k" class="scene-pop" :style="{ animationDelay: `${0.2 + (p.k % 12) * 0.03}s` }">
        <circle :cx="p.x" :cy="p.y" :r="p.r" :fill="dot" :stroke="grown ? '#0b1d28' : '#fff'" stroke-width="2">
          <animateTransform v-if="p.kind === 'wiggle'" attributeName="transform" type="translate" values="0 0;1.8 -1.4;-1.4 1.8;0 0" :dur="`${p.dur.toFixed(2)}s`" :begin="`${p.begin.toFixed(2)}s`" repeatCount="indefinite" />
          <animateMotion v-else :path="p.d" :dur="`${p.dur.toFixed(2)}s`" :begin="`${p.begin.toFixed(2)}s`" repeatCount="indefinite" />
        </circle>
      </g>
      <text x="514" y="356" :font-size="fit(stateWord, 28, 212)" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop" style="animation-delay: 0.6s">{{ stateWord }}</text>
      <text v-if="stateSub" x="514" y="384" :font-size="fit(stateSub, 17, 212)" font-weight="800" :fill="ink" fill-opacity="0.75" text-anchor="middle" class="scene-pop" style="animation-delay: 0.8s">{{ stateSub }}</text>
    </g>
  </svg>
</template>
