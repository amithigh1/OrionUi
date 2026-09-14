<script setup>
import { computed, ref } from 'vue';
import Orion from 'orion-admin';

const ROLES = ['Admin', 'Editor', 'Viewer', 'Manager'];
const DEPTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Design'];
const STATUS = ['Active', 'Active', 'Pending', 'Inactive'];
const first = ['Aisha', 'Ben', 'Chen', 'Diego', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isabel', 'Jamal'];
const last = ['Rahman', 'Tan', 'Garcia', 'Smith', 'Nguyen', 'Okafor', 'Silva', 'Lim', 'Patel', 'Kim'];

const users = ref(Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
  email: `user${i + 1}@example.com`,
  role: ROLES[i % ROLES.length],
  department: DEPTS[i % DEPTS.length],
  status: STATUS[i % STATUS.length],
  salary: 40000 + (i % 20) * 3500,
  joined: new Date(2024, i % 12, (i % 27) + 1),
})));

const columns = [
  { key: 'name', title: 'Name', type: 'avatar' },
  { key: 'email', title: 'Email' },
  { key: 'role', title: 'Role', type: 'badge' },
  { key: 'department', title: 'Department', filter: 'select' },
  { key: 'status', title: 'Status', type: 'badge' },
  { key: 'salary', title: 'Salary', type: 'currency', align: 'end' },
  { key: 'joined', title: 'Joined', type: 'date' },
];

const role = ref('');
const joinedAfter = ref('');
const roleOptions = ROLES.map(r => ({ value: r, label: r }));
const rows = computed(() => (role.value ? users.value.filter(u => u.role === role.value) : users.value));

async function addUser() {
  const name = await Orion.prompt({ title: 'New user', label: 'Full name', required: true });
  if (!name) return;
  users.value = [{ id: users.value.length + 1, name, email: 'new@example.com', role: 'Viewer', department: 'Design', status: 'Pending', salary: 50000, joined: new Date() }, ...users.value];
  Orion.toast.success(`${name} was added`);
}
</script>

<template>
  <div class="o-container o-py-6">
    <div class="o-page-header">
      <h1 class="o-page-title">Users</h1>
      <div class="o-page-header-actions">
        <button class="o-btn" @click="$orion.theme.toggle()">Toggle theme</button>
        <button class="o-btn o-btn-primary" @click="addUser">New user</button>
      </div>
    </div>

    <div class="o-grid o-grid-cols-1 o-grid-cols-md-3 o-gap-4 o-mb-6">
      <div class="o-card o-card-body"><o-stat label="Total users" :value="users.length"></o-stat></div>
      <div class="o-card o-card-body"><o-stat label="Active" :value="users.filter(u => u.status === 'Active').length" color="success"></o-stat></div>
      <div class="o-card o-card-body"><o-stat label="Pending" :value="users.filter(u => u.status === 'Pending').length" color="warning"></o-stat></div>
    </div>

    <div class="o-card o-card-body o-mb-4 o-cluster">
      <label class="o-label o-mb-0">Filter by role</label>
      <!-- v-model works on Orion form controls (value property + native input event) -->
      <o-select v-model="role" :options="roleOptions" clearable placeholder="All roles" style="max-width:16rem"></o-select>
      <o-datepicker v-model="joinedAfter" placeholder="Joined after…"></o-datepicker>
    </div>

    <div class="o-card">
      <o-datatable :columns="columns" :rows="rows" :page-size="10" row-key="id"
                   @o-row-click="$orion.toast(`Clicked ${$event.detail.row.name}`)"></o-datatable>
    </div>
  </div>
</template>
