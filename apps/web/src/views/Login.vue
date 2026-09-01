<script setup lang="ts">
import { reactive, ref } from 'vue';
import { loginAdmin } from '../api';

const form = reactive({ email: '', password: '' });
const error = ref('');
const submitting = ref(false);

async function login() {
  error.value = '';
  submitting.value = true;
  try {
    await loginAdmin(form);
    const redirect = new URLSearchParams(location.search).get('redirect');
    location.href = redirect?.startsWith('/admin') ? redirect : '/admin';
  } catch (reason: any) {
    error.value = reason.response?.data?.message || '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>
<template><main class="login"><section><h1>APPGOG</h1><p>独立管理后台</p><el-input v-model="form.email" autocomplete="username" placeholder="管理员邮箱"/><el-input v-model="form.password" type="password" autocomplete="current-password" show-password placeholder="密码" @keyup.enter="login"/><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-button type="primary" size="large" :loading="submitting" @click="login">登录后台</el-button></section></main></template>
