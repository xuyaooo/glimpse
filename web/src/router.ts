import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

// Home, the child's past work, the camera window, and the tutor's view.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Home' } },
    { path: '/work', name: 'work', component: () => import('@/views/WorkView.vue'), meta: { title: 'My work' } },
    { path: '/scan', name: 'scan', component: () => import('@/views/ScanView.vue'), meta: { title: 'Scan your paper' } },
    { path: '/dashboard/:id?', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), props: true, meta: { title: 'Tutor view' } },
    { path: '/worksheet', name: 'worksheet', component: () => import('@/views/WorksheetView.vue'), meta: { title: 'Printable sheet' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: 'smooth', top: 16 } : { top: 0 }),
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | Glimpse` : 'Glimpse'
})
