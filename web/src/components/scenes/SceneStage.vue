<script setup lang="ts">
// One animation, at one step. Picks the drawing for the scene's kind, on a background that
// suits the learner: a sunny field for little ones, paper for juniors, a dark board for grown-ups.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'
import BalanceScene from './BalanceScene.vue'
import CountScene from './CountScene.vue'
import FractionScene from './FractionScene.vue'
import GroupsScene from './GroupsScene.vue'
import NumberLineScene from './NumberLineScene.vue'
import PairsScene from './PairsScene.vue'
import PlotScene from './PlotScene.vue'
import AreaModelScene from './AreaModelScene.vue'
import ChanceScene from './ChanceScene.vue'
import ColumnsScene from './ColumnsScene.vue'
import CombinationsScene from './CombinationsScene.vue'
import InequalityScene from './InequalityScene.vue'
import MeanScene from './MeanScene.vue'
import OrderOpsScene from './OrderOpsScene.vue'
import PercentScene from './PercentScene.vue'
import PowersScene from './PowersScene.vue'
import PythagorasScene from './PythagorasScene.vue'
import SharingScene from './SharingScene.vue'
import TreeScene from './TreeScene.vue'
import TrigScene from './TrigScene.vue'

const props = defineProps<{ scene: Scene; stage: number }>()
const VIEW: Record<string, unknown> = {
  count: CountScene, number_line: NumberLineScene, columns: ColumnsScene, groups: GroupsScene, area_model: AreaModelScene, sharing: SharingScene,
  fractions: FractionScene, percent: PercentScene, order_ops: OrderOpsScene, powers: PowersScene, mean: MeanScene, balance: BalanceScene,
  inequality: InequalityScene, pythagoras: PythagorasScene, pairs: PairsScene, chance: ChanceScene, combinations: CombinationsScene, tree: TreeScene,
  trig: TrigScene, area: PlotScene, graph: PlotScene, quadratic: PlotScene, limit: PlotScene, derivative: PlotScene, system: PlotScene,
}
const view = computed(() => VIEW[props.scene.kind] as never)
const BG = {
  kid: 'linear-gradient(180deg, #bfe6ff 0%, #e4f5ff 62%, #a8e08a 62%, #8fd474 100%)',
  junior: 'linear-gradient(180deg, #fffdf6, #fff6e0)',
  grown: 'radial-gradient(120% 120% at 30% 20%, #17384a 0%, #0b1d28 70%)',
}
</script>

<template>
  <div class="relative aspect-[16/10] w-full overflow-hidden rounded-[24px] shadow-inner" :style="{ background: BG[scene.skin] }" :class="scene.skin === 'grown' ? 'text-white' : 'text-ink'">
    <component :is="view" :scene="scene" :stage="Math.min(stage, scene.stages.length - 1)" />
  </div>
</template>
