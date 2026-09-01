import { createApp, defineComponent, h, ref } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/style.css';
import '../src/media.css';
import { api, loginAdmin } from '../src/api';
import MediaManager from '../src/components/MediaManager.vue';
import MediaPicker from '../src/components/MediaPicker.vue';
import Admin from '../src/views/Admin.vue';

// Test records only; no real server credentials, database or production writes.
let role = 'ADMIN', failOnce = false;
const assets = Array.from({ length: 122 }, (_, i) => ({ id: `test-${i + 1}`, originalName: `fixture-${String(i + 1).padStart(3, '0')}.png`,
  publicUrl: `/api/v1/public/media/test-${i + 1}`, mimeType: 'image/png', width: 1, height: 1, byteSize: 68,
  altText: `测试图片 ${i + 1}`, folder: 'general', archivedAt: null as string | null }));
api.defaults.adapter = async config => {
  const url = config.url || '', method = config.method;
  let data: any;
  if (url === '/auth/admin/login') data = { accessToken: 'test-only-no-server', expiresIn: 900, user: { id: 'fixture', email: 'fixture@example.invalid', name: '测试账户', role } };
  else if (url === '/admin/components') data = { schemaVersion: 1, components: [] };
  else if (url === '/admin/pages') data = [];
  else if (url === '/admin/media' && method === 'get') {
    if (failOnce) { failOnce = false; throw { response: { status: 503, data: { message: '测试接口暂时不可用' } } }; }
    const { page, limit, search, folder, state } = config.params;
    const rows = assets.filter(item => (!search || (item.originalName + item.altText).includes(search)) && (!folder || item.folder === folder) &&
      (state === 'all' || (state === 'archived' ? item.archivedAt : !item.archivedAt)));
    data = { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit };
  } else {
    const item = assets.find(asset => url === `/admin/media/${asset.id}` || url === `/admin/media/${asset.id}/restore`);
    if (!item) throw new Error('该操作不在独立界面测试范围内');
    if (method === 'delete') item.archivedAt = new Date().toISOString();
    if (method === 'post') item.archivedAt = null;
    if (method === 'patch') Object.assign(item, JSON.parse(config.data));
    data = item;
  }
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
await loginAdmin({ email: 'fixture@example.invalid', password: 'test-only-no-server' });
createApp(defineComponent({
  setup() {
    const revision = ref(0), visible = ref(false), picked = ref(''), adminLayout = ref(false);
    return () => h('main', { style: 'padding:8px;max-width:1100px;margin:auto;color:#222;background:#f1f3f8;overflow-wrap:anywhere' }, [
      h('h2', '第七阶段界面验证 · 仅模拟接口'),
      h('p', '122 条内存测试记录；不连接数据库，不代表生产部署验收。'),
      h('div', [h('label', ['测试角色', h('select', { 'aria-label': '测试角色', value: role, onChange: async (event: Event) => {
        role = (event.target as HTMLSelectElement).value; await loginAdmin({ email: 'fixture@example.invalid', password: 'test-only-no-server' }); revision.value++;
      } }, ['VIEWER', 'EDITOR', 'ADMIN'].map(value => h('option', { value }, value)))]),
      h('button', { onClick: () => { failOnce = true; } }, '模拟下一次列表失败'),
      h('button', { onClick: () => { visible.value = true; } }, '验证选图器'),
      h('button', { onClick: () => { adminLayout.value = !adminLayout.value; } }, '验证真实后台布局')]),
      h('p', { role: 'status' }, `选中地址：${picked.value || '未选择'}`),
      h(adminLayout.value ? Admin : MediaManager, { key: revision.value }),
      h(MediaPicker, { visible: visible.value, onClose: () => { visible.value = false; }, onSelect: (url: string) => { picked.value = url; } })
    ]);
  }
})).use(ElementPlus).mount('#app');
