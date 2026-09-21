import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

/**
 * Application router.
 * Uses hash history — appropriate for Tauri (no server-side routing).
 * Additional routes for Draw, Video, Animation, Devices, Projects,
 * and Settings will be added in later specs.
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    // Placeholder routes — components will be implemented in later specs
    { path: '/draw',      name: 'draw',      component: () => import('../views/DrawView.vue') },
    { path: '/video',     name: 'video',     component: () => import('../views/PlaceholderView.vue') },
    { path: '/animation', name: 'animation', component: () => import('../views/PlaceholderView.vue') },
    { path: '/devices',   name: 'devices',   component: () => import('../views/DevicesView.vue') },
    { path: '/hardware',  name: 'hardware',  component: () => import('../views/HardwareView.vue') },
    { path: '/projects',  name: 'projects',  component: () => import('../views/PlaceholderView.vue') },
    { path: '/settings',  name: 'settings',  component: () => import('../views/PlaceholderView.vue') },
  ],
})

export default router
