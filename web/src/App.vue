<script setup lang="ts">
import { onMounted } from 'vue'
import { startActivityLog } from '@/lib/activity'
import { connect } from '@/lib/engine'
import SettingsDialog from '@/components/SettingsDialog.vue'
import SummaryDialog from '@/components/SummaryDialog.vue'
import ScenePlayer from '@/components/scenes/ScenePlayer.vue'

startActivityLog()
onMounted(connect)
</script>

<template>
  <RouterView />
  <SettingsDialog />
  <SummaryDialog />
  <ScenePlayer />
</template>
