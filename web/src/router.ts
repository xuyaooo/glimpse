import { createRouter, createWebHistory } from 'vue-router'
import StartView from '@/views/StartView.vue'
import { selectStudent, state } from '@/lib/engine'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Child flow: full screen, no menus. Start → Setup → Desk (asking is a state of Desk) → Summary.
    { path: '/', name: 'start', component: StartView, meta: { title: "Who's at the desk?" } },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { title: 'Setup check', needsStudent: true } },
    { path: '/desk', name: 'desk', component: () => import('@/views/DeskView.vue'), meta: { title: 'Desk', needsStudent: true } },
    { path: '/summary', name: 'summary', component: () => import('@/views/SummaryView.vue'), meta: { title: 'Well done', needsStudent: true } },

    // Teacher, NGO and jury: one layout with a top navigation.
    {
      path: '/teacher',
      component: () => import('@/layouts/TeacherLayout.vue'),
      children: [
        { path: '', name: 'class', component: () => import('@/views/teacher/ClassView.vue'), meta: { title: 'Class' } },
        { path: 'students/:id', name: 'student', component: () => import('@/views/teacher/StudentView.vue'), props: true, meta: { title: 'Child' } },
        { path: 'misconceptions', name: 'library', component: () => import('@/views/teacher/LibraryView.vue'), meta: { title: 'Misconceptions' } },
        { path: 'system', name: 'system', component: () => import('@/views/teacher/SystemView.vue'), meta: { title: 'System and cost' } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  // `?student=amara` lets you open a child screen directly while developing.
  if (typeof to.query.student === 'string') selectStudent(to.query.student)
  if (to.meta.needsStudent && !state.student) return { name: 'start' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | Glimpse` : 'Glimpse'
})
