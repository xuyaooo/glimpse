<script setup lang="ts">
// Typesets the reader's LaTeX. KaTeX escapes its input and runs offline.
// wrap: a long formula may break onto the next line after = + − (KaTeX's inline line breaks),
// with room between the lines.
import { computed } from 'vue'
import katex from 'katex'

const props = defineProps<{ latex: string; wrap?: boolean }>()
const html = computed(() => katex.renderToString(props.latex, { throwOnError: false }))
</script>

<template>
  <span :class="wrap ? 'leading-[1.55]' : 'leading-none'" v-html="html" />
</template>
