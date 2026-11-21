<script setup lang="ts">
// Typesets the reader's LaTeX. KaTeX escapes its input and runs offline.
import { computed } from 'vue'
import katex from 'katex'

const props = defineProps<{ latex: string }>()
const html = computed(() => katex.renderToString(props.latex, { throwOnError: false }))
</script>

<template>
  <span class="leading-none" v-html="html" />
</template>
