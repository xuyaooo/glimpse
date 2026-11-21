<script setup lang="ts">
import { onMounted } from 'vue'
import { startActivityLog } from '@/lib/activity'
import { connect } from '@/lib/engine'

startActivityLog()
onMounted(connect)
</script>

<template>
  <RouterView />
</template>
