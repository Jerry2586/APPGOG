import { createRouter, createWebHistory } from 'vue-router';
import SitePage from './views/SitePage.vue';
import { ensureAdminSession } from './api';
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/admin/login', component: () => import('./views/Login.vue') }, { path: '/admin/:pathMatch(.*)*', component: () => import('./views/Admin.vue') },
  { path: '/content/:slug(.*)+', component: () => import('./views/ContentView.vue') },
  { path: '/:slug(.*)*', component: SitePage }
] });

router.beforeEach(async (to, from) => {
  // Public executable snippets must never survive into an authenticated document.
  if (from.matched.length && to.path.startsWith('/admin') !== from.path.startsWith('/admin')) {
    location.assign(to.fullPath);
    return false;
  }
  if (!to.path.startsWith('/admin') || to.path === '/admin/login') return true;
  try {
    await ensureAdminSession();
    return true;
  } catch {
    return { path: '/admin/login', query: { redirect: to.fullPath } };
  }
});
