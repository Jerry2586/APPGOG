import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import './effects.css';
import './media.css';
import './cms.css';
import './catalog.css';
import './ai.css';
import './operations.css';
import './site.css';
import App from './App.vue';
import { router } from './router';

async function bootstrap() {
  const app = createApp(App).use(createPinia()).use(router);
  // The editor widget library is administration-only. Public JSON pages render
  // before this optional bundle is ever requested.
  if (location.pathname.startsWith('/admin')) {
    const [{ default: ElementPlus }] = await Promise.all([
      import('element-plus'),
      import('element-plus/dist/index.css')
    ]);
    app.use(ElementPlus);
  }
  app.mount('#app');
}

void bootstrap();
