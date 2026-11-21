<script setup lang="ts">
// Home: the greeting over the Alps, today's numbers, continue your practice (opens the camera),
// and on the right the subjects and the badges. Past exercises live on My work.
import { useRouter } from 'vue-router'
import AchievementsCard from '@/components/AchievementsCard.vue'
import AppShell from '@/components/AppShell.vue'
import ContinueCard from '@/components/ContinueCard.vue'
import HomeLandscape from '@/components/HomeLandscape.vue'
import Mascot from '@/components/Mascot.vue'
import StatsCard from '@/components/StatsCard.vue'
import StudentPickerModal from '@/components/StudentPickerModal.vue'
import SubjectCard from '@/components/SubjectCard.vue'
import TopBar from '@/components/TopBar.vue'
import { chooseSubject, state } from '@/lib/engine'
import { ui } from '@/lib/ui'
import { useDesk } from '@/lib/useDesk'

const router = useRouter()
const desk = useDesk()
const { subject, right, accuracy, runs, fixed, greeting, subtitle } = desk

// Searching past exercises happens on My work.
function search(v: string) {
  ui.search = v
  router.push({ name: 'work' })
}
</script>

<template>
  <AppShell>
    <div class="relative">
      <HomeLandscape />

      <div class="relative">
        <TopBar :avatar="state.student?.name[0] ?? '?'" :bell="state.exercises.length" :search="ui.search" @update:search="search" @bell="desk.nextStep" @avatar="ui.pickerOpen = true" />

        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8">
          <!-- left: greeting, today, continue -->
          <div class="flex min-w-0 flex-col gap-7">
            <header class="stagger pt-1" style="--d: 0ms">
              <h1 class="flex flex-wrap items-center gap-3 text-[36px] font-black leading-[1.1] tracking-[-0.02em] sm:text-[46px]">
                {{ greeting }}
                <span class="inline-block origin-[70%_80%] text-[40px]" style="animation: wave-arm 0.6s ease-in-out 0.6s 6 alternate" aria-hidden="true">👋</span>
              </h1>
              <p class="mt-2 text-[20px] font-semibold text-ink-2 sm:text-[22px]">{{ subtitle }}</p>
            </header>
            <StatsCard :accuracy="accuracy" :streak="runs.now" :points="right * 10" />
            <ContinueCard :parts="state.parts" :name="state.student?.name ?? ''" :subject="subject" :started-at="state.startedAt" @open="desk.openCamera" />
          </div>

          <!-- right: Glim with a star, subjects, badges -->
          <div class="flex min-w-0 flex-col gap-5">
            <div class="relative hidden h-[210px] xl:block" aria-hidden="true">
              <div class="absolute bottom-[-18px] left-1/2 -translate-x-[40%]">
                <Mascot :size="200" wave />
                <svg class="absolute -left-8 top-[52px] size-[78px]" viewBox="0 0 80 80" style="animation: hop 2.4s ease-in-out 0.8s infinite">
                  <g stroke="#FFC93C" stroke-width="4" stroke-linecap="round" class="svg-center" style="animation: pop 1.6s ease-in-out infinite alternate">
                    <path d="M14 10l5 8M6 26l9 3M30 4l1 9" />
                  </g>
                  <path d="M44 16l7.4 15 16.6 2.4-12 11.7 2.8 16.5L44 53.8l-14.8 7.8 2.8-16.5-12-11.7 16.6-2.4z" fill="#FFC93C" stroke="#F5A524" stroke-width="3" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
            <SubjectCard :current="state.subject" :waiting="state.exercises.length" :ping="ui.practicePing" @pick="chooseSubject" />
            <AchievementsCard :right="right" :fixed="fixed" :best-run="runs.best" :asked="state.questions.length" />
          </div>
        </div>
      </div>
    </div>

    <StudentPickerModal :open="ui.pickerOpen" :current="state.student?.id" @pick="desk.pick" @close="desk.closePicker" />
  </AppShell>
</template>
