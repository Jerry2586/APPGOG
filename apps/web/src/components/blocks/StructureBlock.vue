<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Block } from '../../types';
const props = defineProps<{ block: Block }>();
const menuId = computed(() => `navigation-${props.block.id}`);
const menuOpen = ref(false);
const navItems = computed(() => Array.isArray(props.block.props.navItems) ? props.block.props.navItems : []);
const columns = computed(() => Array.isArray(props.block.props.columns) ? props.block.props.columns : []);
const socialLinks = computed(() => Array.isArray(props.block.props.socialLinks) ? props.block.props.socialLinks : []);
const crumbs = computed(() => Array.isArray(props.block.props.items) ? props.block.props.items : []);
function toggleTheme() {
  window.dispatchEvent(new Event('appgog-theme-toggle'));
}
function goBack() { props.block.props.backUrl ? location.assign(String(props.block.props.backUrl)) : history.length > 1 ? history.back() : location.assign(String(props.block.props.homeUrl || '/')); }
</script>
<template>
  <header v-if="block.type === 'header'" class="block site-header" :class="{ sticky: block.props.sticky }">
    <nav aria-label="主导航">
      <a class="site-logo" :href="block.props.logoUrl || '/'">{{ block.props.logoText }}</a>
      <button class="nav-toggle" type="button" :aria-expanded="menuOpen" :aria-controls="menuId" @click="menuOpen = !menuOpen"><span class="sr-only">切换导航菜单</span>☰</button>
      <div :id="menuId" class="nav-links" :class="{ open: menuOpen }" @keydown.esc="menuOpen = false">
        <a v-for="(item,index) in navItems" :key="index" :href="item.url || '#'">{{ item.label || item.text }}</a>
      </div>
      <div class="nav-actions"><button v-if="block.props.themeToggle" type="button" @click="toggleTheme"><span aria-hidden="true">◐</span><span class="sr-only">切换明暗主题</span></button><a v-if="block.props.ctaText" class="action action-primary" :href="block.props.url || '#'">{{ block.props.ctaText }}</a></div>
    </nav>
  </header>
  <footer v-else-if="block.type === 'footer'" class="block site-footer">
    <div class="footer-columns"><section v-for="(column,index) in columns" :key="index"><h2>{{ column.title }}</h2><a v-for="(link,linkIndex) in column.links || []" :key="linkIndex" :href="link.url || '#'">{{ link.label || link.text }}</a></section></div>
    <div v-if="socialLinks.length" class="social-links"><a v-for="(link,index) in socialLinks" :key="index" :href="link.url || '#'">{{ link.label || link.text }}</a></div><p>{{ block.props.text }}</p><small v-if="block.props.legalText">{{ block.props.legalText }}</small>
  </footer>
  <nav v-else class="block breadcrumb" aria-label="面包屑">
    <button v-if="block.props.showBack" type="button" @click="goBack">← 返回</button>
    <ol><li><a :href="block.props.homeUrl || '/'">{{ block.props.homeLabel }}</a></li><li v-for="(item,index) in crumbs" :key="index"><a v-if="item.url" :href="item.url">{{ item.label || item.text }}</a><span v-else aria-current="page">{{ item.label || item.text }}</span></li></ol>
  </nav>
</template>
