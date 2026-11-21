<script setup lang="ts">
import Clouds from './Clouds.vue'
import SideNav from './SideNav.vue'
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden lg:pl-[220px]" style="background: linear-gradient(180deg, #d6ecf9 0%, #e8f4fb 34%, #f4f9fd 70%, #f8fbfe 100%)">
    <SideNav />
    <Clouds />
    <div class="relative z-10 mx-auto w-full max-w-[1500px] px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <slot />
    </div>
  </div>
</template>
