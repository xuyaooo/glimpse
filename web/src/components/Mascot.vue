<script setup lang="ts">
// Glim, the lens: Glimpse's mascot. It blinks, bobs, and waves when it greets you.
withDefaults(defineProps<{ size?: number; wave?: boolean; label?: string }>(), { size: 72, wave: false, label: '' })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 120 120" class="overflow-visible" :role="label ? 'img' : undefined" :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'">
    <defs>
      <linearGradient id="glim-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#25B6AA" />
        <stop offset="1" stop-color="#0D766E" />
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="114" rx="28" ry="4.5" fill="#0B3B48" opacity="0.14" />
    <g class="animate-bob">
      <ellipse cx="17" cy="78" rx="8.5" ry="13" fill="#0F8278" transform="rotate(24 17 78)" />
      <g class="svg-center" :style="wave ? { animation: 'wave-arm 0.7s ease-in-out infinite alternate', transformOrigin: '20% 90%' } : undefined">
        <ellipse cx="103" cy="60" rx="8.5" ry="13" fill="#0F8278" transform="rotate(-34 103 60)" />
      </g>
      <circle cx="60" cy="68" r="44" fill="url(#glim-body)" />
      <circle cx="60" cy="66" r="32" fill="#F7FBFF" />
      <circle cx="60" cy="66" r="32" fill="none" stroke="#BDE8E2" stroke-width="3" />
      <g class="svg-center" style="animation: blink 5.2s infinite">
        <ellipse cx="48" cy="63" rx="6" ry="7.5" fill="#18294A" />
        <ellipse cx="72" cy="63" rx="6" ry="7.5" fill="#18294A" />
        <circle cx="50" cy="60" r="2.1" fill="#fff" />
        <circle cx="74" cy="60" r="2.1" fill="#fff" />
      </g>
      <ellipse cx="40" cy="76" rx="5" ry="3" fill="#FFB0B0" opacity="0.75" />
      <ellipse cx="80" cy="76" rx="5" ry="3" fill="#FFB0B0" opacity="0.75" />
      <path d="M51 77 Q60 85 69 77" fill="none" stroke="#18294A" stroke-width="3" stroke-linecap="round" />
      <path d="M86 30 L96 17" stroke="#F47A2A" stroke-width="5" stroke-linecap="round" />
      <circle cx="99" cy="13" r="4.5" fill="#FFC93C" class="svg-center" style="animation: pop 2.4s ease-in-out infinite alternate" />
    </g>
  </svg>
</template>
