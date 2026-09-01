<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { onBeforeRouteLeave } from 'vue-router';
import { currentAdminAccount, logoutAdmin } from '../api';
import PageEditor from '../components/PageEditor.vue';
import ResourceManager from '../components/ResourceManager.vue';
import SecurityManager from '../components/SecurityManager.vue';
import MediaManager from '../components/MediaManager.vue';
import CmsManager from '../components/CmsManager.vue';
import CategoryManager from '../components/CategoryManager.vue';
import ProductManager from '../components/ProductManager.vue';
import RagManager from '../components/RagManager.vue';
import OperationsManager from '../components/OperationsManager.vue';

const menu = ref('pages');
const admin = currentAdminAccount();
const allMenuItems = [
  ['pages', '页面装修引擎', 'VIEWER'],
  ['media', '媒体资源库', 'VIEWER'],
  ['category', '无限分类树', 'VIEWER'],
  ['content', '文档 CMS 库', 'VIEWER'],
  ['video', '影视教程库', 'VIEWER'],
  ['faq', 'FAQ 知识库', 'VIEWER'],
  ['rag', '文档投喂 / AI 客服', 'VIEWER'],
  ['product', '独立商品库', 'VIEWER'],
  ['productCategory', '商品分类树', 'VIEWER'],
  ['theme', '节日皮肤库', 'ADMIN'],
  ['themeSchedule', '主题自动调度', 'ADMIN'],
  ['marketingCampaign', '自动化与营销', 'ADMIN'],
  ['outboundLink', '普通外跳链接', 'ADMIN'],
  ['globalSetting', '系统设置', 'SUPER_ADMIN'],
  ['pluginSnippet', '第三方统计/客服', 'SUPER_ADMIN'],
  ['security', '管理安全中心', 'VIEWER']
] as const;
const roleRank = { VIEWER: 0, EDITOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
const menuItems = computed(() => allMenuItems.filter(item => admin && roleRank[admin.role] >= roleRank[item[2]]));
const cmsEditor=ref<{hasUnsavedChanges:()=>boolean;isBusy?:()=>boolean}>();
async function mayLeave() {
  if(cmsEditor.value?.isBusy?.()) return false;
  if(!cmsEditor.value?.hasUnsavedChanges()) return true;
  try {await ElMessageBox.confirm('当前编辑尚未保存，确定放弃修改？','未保存的修改');return true}catch{return false}
}
async function chooseMenu(value:string){if(value!==menu.value&&await mayLeave())menu.value=value}
onBeforeRouteLeave(mayLeave);

async function logout() {
  if(!(await mayLeave()))return;
  await logoutAdmin();
  location.href = '/admin/login';
}
</script>

<template>
  <div class="admin-shell" :class="{ 'ops-mode': ['theme','themeSchedule','marketingCampaign','pluginSnippet'].includes(menu), 'media-mode': menu === 'media', 'cms-mode': ['category','content','video','faq','product','productCategory'].includes(menu) }">
    <header class="top">
      <strong>APPGOG 可视化扩展运营系统</strong>
      <span class="safe">● Xboard 完全隔离</span>
      <span>{{ admin?.name }} · {{ admin?.role }}</span>
      <button @click="logout">退出</button>
    </header>
    <aside class="side">
      <h3>主菜单导航</h3>
      <button v-for="item in menuItems" :key="item[0]" :class="{ active: menu === item[0] }" @click="chooseMenu(item[0])">{{ item[1] }}</button>
    </aside>
    <PageEditor v-if="menu === 'pages'" ref="cmsEditor" />
    <main v-else-if="menu === 'security'" class="module"><SecurityManager /></main>
    <main v-else-if="menu === 'media'" class="module"><MediaManager /></main>
    <main v-else-if="menu === 'category'" class="module"><CategoryManager ref="cmsEditor" /></main>
    <main v-else-if="menu === 'productCategory'" class="module"><CategoryManager ref="cmsEditor" scope="PRODUCT" :key="menu" /></main>
    <main v-else-if="menu === 'product'" class="module"><ProductManager ref="cmsEditor" /></main>
    <main v-else-if="menu === 'rag'" class="module"><RagManager ref="cmsEditor" /></main>
    <main v-else-if="menu==='theme'||menu==='themeSchedule'||menu==='marketingCampaign'||menu==='pluginSnippet'" class="module"><OperationsManager ref="cmsEditor" :kind="menu" :key="menu" /></main>
    <main v-else-if="menu === 'content'||menu === 'video'||menu === 'faq'" class="module"><CmsManager ref="cmsEditor" :kind="menu" /></main>
    <main v-else class="module"><ResourceManager :kind="menu" /></main>
  </div>
</template>
