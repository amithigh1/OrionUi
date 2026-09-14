import React, { useMemo, useRef, useState } from 'react';
import Orion from 'orion-admin';

// Wrapper components for the Orion custom elements.
// Props become element properties (so arrays/objects/functions work), and
// onXxx handlers subscribe to the matching `o-xxx` events.
const { Select, Datatable, Datepicker, Stat } = Orion.react(React);

type User = { id: number; name: string; email: string; role: string; department: string; status: string; salary: number; joined: Date };

const ROLES = ['Admin', 'Editor', 'Viewer', 'Manager'];
const DEPTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Design'];
const STATUS = ['Active', 'Active', 'Pending', 'Inactive'];

function makeUsers(n: number): User[] {
  const first = ['Aisha', 'Ben', 'Chen', 'Diego', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isabel', 'Jamal'];
  const last = ['Rahman', 'Tan', 'Garcia', 'Smith', 'Nguyen', 'Okafor', 'Silva', 'Lim', 'Patel', 'Kim'];
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
    email: `user${i + 1}@example.com`,
    role: ROLES[i % ROLES.length],
    department: DEPTS[i % DEPTS.length],
    status: STATUS[i % STATUS.length],
    salary: 40000 + (i % 20) * 3500,
    joined: new Date(2024, i % 12, (i % 27) + 1),
  }));
}

export default function App() {
  const [users, setUsers] = useState(() => makeUsers(120));
  const [role, setRole] = useState('');
  const tableRef = useRef<any>(null);

  const columns = useMemo(() => [
    { key: 'name', title: 'Name', type: 'avatar' },
    { key: 'email', title: 'Email' },
    { key: 'role', title: 'Role', type: 'badge' },
    { key: 'department', title: 'Department', filter: 'select' },
    { key: 'status', title: 'Status', type: 'badge' },
    { key: 'salary', title: 'Salary', type: 'currency', align: 'end' },
    { key: 'joined', title: 'Joined', type: 'date' },
  ], []);

  const rows = useMemo(() => (role ? users.filter(u => u.role === role) : users), [users, role]);

  return (
    <div className="o-container o-py-6">
      <div className="o-page-header">
        <h1 className="o-page-title">Users</h1>
        <div className="o-page-header-actions">
          <button className="o-btn" onClick={() => Orion.theme.toggle()}>Toggle theme</button>
          <button className="o-btn o-btn-primary" onClick={async () => {
            const name = await Orion.prompt({ title: 'New user', label: 'Full name', required: true });
            if (!name) return;
            setUsers(u => [{ ...makeUsers(1)[0], id: u.length + 1, name, status: 'Pending' }, ...u]);
            Orion.toast.success(`${name} was added`);
          }}>New user</button>
        </div>
      </div>

      <div className="o-grid o-grid-cols-1 o-grid-cols-md-3 o-gap-4 o-mb-6">
        <div className="o-card o-card-body"><Stat label="Total users" value={users.length} /></div>
        <div className="o-card o-card-body"><Stat label="Active" value={users.filter(u => u.status === 'Active').length} color="success" /></div>
        <div className="o-card o-card-body"><Stat label="Pending" value={users.filter(u => u.status === 'Pending').length} color="warning" /></div>
      </div>

      <div className="o-card o-card-body o-mb-4 o-cluster">
        <label className="o-label o-mb-0">Filter by role</label>
        <Select
          style={{ maxWidth: '16rem' }}
          value={role}
          clearable
          placeholder="All roles"
          options={ROLES.map(r => ({ value: r, label: r }))}
          onChange={(e: CustomEvent) => setRole(e.detail.value)}
        />
        <Datepicker placeholder="Joined after…" onChange={(e: CustomEvent) => console.log('date', e.detail.value)} />
      </div>

      <div className="o-card">
        <Datatable ref={tableRef} columns={columns} rows={rows} pageSize={10} rowKey="id"
                   onRowClick={(e: CustomEvent) => Orion.toast(`Clicked ${e.detail.row.name}`)} />
      </div>
    </div>
  );
}
