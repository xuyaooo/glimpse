<script setup lang="ts">
import { onMounted } from 'vue'
import { connect } from '@/lib/engine'

onMounted(connect)
</script>

<template>
  <RouterView />
</template>
