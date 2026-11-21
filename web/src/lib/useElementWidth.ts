import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useElementWidth(el: Ref<HTMLElement | null>) {
  const width = ref(0)
  let observer: ResizeObserver | null = null
  onMounted(() => {
    observer = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
    if (el.value) observer.observe(el.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}
