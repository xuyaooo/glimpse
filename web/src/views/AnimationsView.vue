<script setup lang="ts">
// The animation library: every kind of exercise that gets an animation, by level, with a live
// preview and examples to watch (each one picked by Laya and computed by the engine).
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import MathTex from '@/components/MathTex.vue'
import TopBar from '@/components/TopBar.vue'
import SceneStage from '@/components/scenes/SceneStage.vue'
import { state } from '@/lib/engine'
import { titleTex } from '@/lib/latex'
import { start } from '@/lib/player'
import { settings } from '@/lib/settings'
import { CATALOG, sceneIcon, sceneLabel } from '@/lib/sceneKinds'
import type { Scene } from '@/lib/types'
import { ui } from '@/lib/ui'

const router = useRouter()
// Searching your exercises happens on My work (as from Home): there is nothing to search here.
function search(v: string) {
  ui.search = v
  router.push({ name: 'work' })
}
const previews = reactive<Record<string, Scene | null>>({})
const busy = ref('')
const error = ref('')
const age = () => settings.age || state.student?.age || 10
type Kind = (typeof CATALOG)[number]['kinds'][number]
// each card shows its own animation: at most the age it is made for
const sceneOf = async (text: string, k?: Kind) => {
  const r = await fetch(`/api/scene?text=${encodeURIComponent(text)}&age=${Math.min(age(), k?.maxAge ?? Infinity)}`)
  const s = await r.json()
  return s?.kind ? (s as Scene) : null
}

onMounted(async () => {
  // previews of the first example of each kind, a few at a time
  const all = CATALOG.flatMap((g) => g.kinds)
  try {
    for (let i = 0; i < all.length; i += 5) {
      await Promise.all(all.slice(i, i + 5).map(async (k) => (previews[k.kind] = await sceneOf(k.examples[0], k))))
    }
  } catch {
    error.value = 'The previews need the tutor engine (npm run dev).'
  }
})

async function watch(text: string, k: Kind) {
  busy.value = text
  try {
    const sc = await sceneOf(text, k)
    if (sc) start({ about: text, title: sceneLabel(sc.kind), items: [], result: sc.resultTex, lang: state.lang, at: Date.now(), scene: sc }, 'full')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <AppShell>
    <TopBar title="Animations" subtitle="Every kind of exercise Glim can show as an animation. Tap an example to watch it." :sun="false" :avatar="state.student?.name[0] ?? '?'" :bell="0" :search="ui.search" @update:search="search" @avatar="ui.pickerOpen = true" />
    <p v-if="error" class="card p-4 text-[15px] font-bold text-wrong">{{ error }}</p>
    <div class="flex flex-col gap-6">
      <section v-for="(g, gi) in CATALOG" :key="g.level" class="flex flex-col gap-3">
        <h2 class="flex items-center gap-3 text-[22px] font-black">
          {{ g.level }}
          <span class="rounded-full bg-line-2 px-2.5 py-0.5 text-[13px] font-black text-ink-2">{{ g.kinds.length }}</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="(k, ki) in g.kinds" :key="k.kind" class="card stagger flex flex-col gap-3 overflow-hidden p-0" :style="{ '--d': `${(gi * 4 + ki) * 40}ms` }">
            <button type="button" class="relative block w-full" :aria-label="`Watch: ${sceneLabel(k.kind)}`" @click="watch(k.examples[0], k)">
              <SceneStage v-if="previews[k.kind]" :scene="previews[k.kind]!" :stage="previews[k.kind]!.stages.length - 1" class="!rounded-none" />
              <div v-else class="shimmer aspect-[16/10] w-full" />
              <span class="absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full bg-tangerine text-white shadow-lg transition hover:scale-110"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
            </button>
            <div class="flex flex-col gap-2 px-4 pb-4">
              <h3 class="flex items-center gap-2 text-[18px] font-black"><span aria-hidden="true">{{ sceneIcon(k.kind) }}</span>{{ sceneLabel(k.kind) }}</h3>
              <p class="text-[14px] font-semibold leading-snug text-ink-2">{{ k.what }}</p>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="e in k.examples" :key="e" type="button" class="rounded-xl border-2 px-2.5 py-1 transition hover:-translate-y-0.5 hover:border-lagoon" :class="busy === e ? 'border-lagoon bg-lagoon-mist' : 'border-line bg-white'" @click="watch(e, k)">
                  <MathTex :latex="titleTex(e)" class="text-[15px]" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </AppShell>
</template>
