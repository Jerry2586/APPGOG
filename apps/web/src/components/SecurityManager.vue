<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, currentAdminAccount, logoutAdmin } from '../api';

const admin = currentAdminAccount();
const sessions = ref<any[]>([]);
const accounts = ref<any[]>([]);
const inspectedAccount = ref<any | null>(null);
const accountSessions = ref<any[]>([]);
const auditLogs = ref<any[]>([]);
const passwordForm = reactive({ currentPassword: '', nextPassword: '' });
const createForm = reactive({ email: '', displayName: '', password: '', role: 'VIEWER' });
const creating = ref(false);
const isSuperAdmin = computed(() => admin?.role === 'SUPER_ADMIN');
const canReadAudit = computed(() => ['ADMIN', 'SUPER_ADMIN'].includes(admin?.role || ''));

async function loadSessions() {
  sessions.value = (await api.get('/auth/admin/sessions')).data;
}

async function loadAccounts() {
  if (isSuperAdmin.value) accounts.value = (await api.get('/admin/security/accounts')).data;
}

async function loadAudit() {
  if (canReadAudit.value) auditLogs.value = (await api.get('/admin/security/audit', { params: { limit: 100 } })).data;
}

async function revokeSession(session: any) {
  await api.delete(`/auth/admin/sessions/${session.id}`);
  if (session.current) {
    await logoutAdmin();
    location.href = '/admin/login';
    return;
  }
  await loadSessions();
  ElMessage.success('会话已撤销');
}

async function revokeAll() {
  await ElMessageBox.confirm('这会撤销包括当前设备在内的全部管理会话，是否继续？', '撤销全部会话', { type: 'warning' });
  await api.post('/auth/admin/sessions/revoke-all');
  location.href = '/admin/login';
}

async function changePassword() {
  await api.post('/auth/admin/password', passwordForm);
  passwordForm.currentPassword = '';
  passwordForm.nextPassword = '';
  ElMessage.success('密码已修改，所有会话已撤销，请重新登录');
  location.href = '/admin/login';
}

async function createAccount() {
  creating.value = true;
  try {
    await api.post('/admin/security/accounts', createForm);
    Object.assign(createForm, { email: '', displayName: '', password: '', role: 'VIEWER' });
    await loadAccounts();
    ElMessage.success('管理员已创建');
  } finally {
    creating.value = false;
  }
}

async function saveAccount(account: any) {
  await api.patch(`/admin/security/accounts/${account.id}`, {
    displayName: account.displayName,
    role: account.role,
    enabled: account.enabled
  });
  await loadAccounts();
  ElMessage.success('管理员权限已更新，原会话已撤销');
}

async function inspectSessions(account: any) {
  inspectedAccount.value = account;
  accountSessions.value = (await api.get(`/admin/security/accounts/${account.id}/sessions`)).data;
}

async function forceRevokeSession(session: any) {
  if (!inspectedAccount.value) return;
  await api.delete(`/admin/security/accounts/${inspectedAccount.value.id}/sessions/${session.id}`);
  await inspectSessions(inspectedAccount.value);
  ElMessage.success('目标管理员会话已强制撤销');
}

async function resetPassword(account: any) {
  const { value } = await ElMessageBox.prompt('输入至少 16 位、至少三类字符的新密码', `重置 ${account.email} 的密码`, {
    inputType: 'password',
    inputValidator: value => value.length >= 16 || '密码至少需要 16 位'
  });
  await api.post(`/admin/security/accounts/${account.id}/password`, { password: value });
  ElMessage.success('密码已重置，目标管理员的所有会话已撤销');
}

onMounted(() => Promise.all([loadSessions(), loadAccounts(), loadAudit()]));
</script>

<template>
  <section class="security-manager">
    <h2>管理安全中心</h2>
    <p>当前管理员：{{ admin?.name }}（{{ admin?.role }}）</p>

    <h3>我的活动会话</h3>
    <table>
      <thead><tr><th>设备</th><th>IP</th><th>最近使用</th><th>到期</th><th>状态</th><th>操作</th></tr></thead>
      <tbody><tr v-for="session in sessions" :key="session.id">
        <td>{{ session.userAgent || '未知设备' }}</td><td>{{ session.ip || '-' }}</td>
        <td>{{ new Date(session.lastUsedAt).toLocaleString() }}</td><td>{{ new Date(session.expiresAt).toLocaleString() }}</td>
        <td>{{ session.revokedAt ? '已撤销' : session.current ? '当前会话' : '活动' }}</td>
        <td><button v-if="!session.revokedAt" @click="revokeSession(session)">撤销</button></td>
      </tr></tbody>
    </table>
    <button class="danger" @click="revokeAll">撤销我的全部会话</button>

    <h3>修改我的密码</h3>
    <div class="security-form">
      <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" placeholder="当前密码">
      <input v-model="passwordForm.nextPassword" type="password" autocomplete="new-password" placeholder="新密码（至少 16 位）">
      <button @click="changePassword">修改密码并重新登录</button>
    </div>

    <template v-if="isSuperAdmin">
      <h3>管理员账号</h3>
      <div class="security-form">
        <input v-model="createForm.email" placeholder="邮箱">
        <input v-model="createForm.displayName" placeholder="显示名称">
        <input v-model="createForm.password" type="password" autocomplete="new-password" placeholder="初始密码（至少 16 位）">
        <select v-model="createForm.role"><option>VIEWER</option><option>EDITOR</option><option>ADMIN</option><option>SUPER_ADMIN</option></select>
        <button :disabled="creating" @click="createAccount">创建管理员</button>
      </div>
      <table>
        <thead><tr><th>邮箱</th><th>显示名称</th><th>角色</th><th>启用</th><th>操作</th></tr></thead>
        <tbody><tr v-for="account in accounts" :key="account.id">
          <td>{{ account.email }}</td><td><input v-model="account.displayName"></td>
          <td><select v-model="account.role"><option>VIEWER</option><option>EDITOR</option><option>ADMIN</option><option>SUPER_ADMIN</option></select></td>
          <td><input v-model="account.enabled" type="checkbox"></td>
          <td><button @click="saveAccount(account)">保存</button><button @click="resetPassword(account)">重置密码</button><button @click="inspectSessions(account)">会话</button></td>
        </tr></tbody>
      </table>
      <template v-if="inspectedAccount">
        <h4>{{ inspectedAccount.email }} 的会话</h4>
        <table>
          <thead><tr><th>设备</th><th>IP</th><th>创建</th><th>最近使用</th><th>到期</th><th>状态</th><th>操作</th></tr></thead>
          <tbody><tr v-for="session in accountSessions" :key="session.id">
            <td>{{ session.userAgent || '未知设备' }}</td><td>{{ session.ip || '-' }}</td>
            <td>{{ new Date(session.createdAt).toLocaleString() }}</td><td>{{ new Date(session.lastUsedAt).toLocaleString() }}</td>
            <td>{{ new Date(session.expiresAt).toLocaleString() }}</td><td>{{ session.revokedAt ? '已撤销' : '活动' }}</td>
            <td><button v-if="!session.revokedAt" @click="forceRevokeSession(session)">强制撤销</button></td>
          </tr></tbody>
        </table>
      </template>
    </template>

    <template v-if="canReadAudit">
      <h3>最近安全审计</h3>
      <table>
        <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>资源</th><th>IP</th></tr></thead>
        <tbody><tr v-for="log in auditLogs" :key="log.id">
          <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
          <td>{{ log.adminUser?.email || '系统/未知' }}</td><td>{{ log.action }}</td>
          <td>{{ log.resource }} {{ log.resourceId || '' }}</td><td>{{ log.ip || '-' }}</td>
        </tr></tbody>
      </table>
    </template>
  </section>
</template>
