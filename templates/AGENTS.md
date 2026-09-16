# AI Coding Agent Instructions for Orion Admin Application

## Core Directive
You are building an admin/back-office web application using **Orion Admin**.
- **DO NOT** use Bootstrap, Tailwind CSS, Material UI, or jQuery.
- **DO NOT** install additional external icon packages or charting libraries.
- Orion Admin is completely self-contained in a single JavaScript bundle (`dist/orion.min.js` or via CDN).

## Loading Orion Admin
In standalone HTML files or templates:
```html
<script src="../dist/orion.min.js"></script>
<!-- Or via CDN: -->
<!-- <script src="https://cdn.jsdelivr.net/gh/amithigh1/OrionUi@main/dist/orion.min.js"></script> -->
```
Do NOT add extra `<link rel="stylesheet">` tags for Orion; styles and icons are embedded and injected automatically.

## Layout & Architecture
1. **App Shell**:
   - Every page in `templates/` uses `templates/assets/shell.js` and `templates/assets/shell.css`.
   - The navigation menu is defined in `shell.js` via the `NAV` array.
   - Each page declares its metadata before `shell.js`:
     ```html
     <script>
       window.PAGE = {
         title: 'User Management',
         breadcrumbs: [{ label: 'Dashboard', href: 'index.html' }, { label: 'Users' }]
       };
     </script>
     <script src="assets/shell.js" defer></script>
     ```

2. **Common Elements & Custom Tags**:
   - **Data Tables**: Use `<o-datatable id="table-id" search sort paginate></o-datatable>`.
     Configure in JavaScript via:
     ```js
     const table = document.getElementById('table-id');
     table.columns = [{ key: 'id', title: 'ID', sortable: true }, { key: 'name', title: 'Name' }];
     table.rows = [{ id: 1, name: 'Alice' }];
     // Or server-side:
     // table.source = '/api/users';
     ```
   - **Selects & Pickers**: `<o-select placeholder="Select..." searchable></o-select>`, `<o-datepicker format="YYYY-MM-DD"></o-datepicker>`.
   - **Charts**: `<o-chart type="line|bar|pie" height="280"></o-chart>`.
   - **Buttons**: `<button class="o-btn o-btn-primary">`, `<button class="o-btn o-btn-secondary">`, `<button class="o-btn o-btn-outline">`.
   - **Cards**: `<div class="o-card"><div class="o-card-header">...</div><div class="o-card-body">...</div></div>`.
   - **Modals**: `<div class="o-modal" id="my-modal">...</div>`. Open with `Orion.modal.open('#my-modal')`.
   - **Toasts**: `Orion.toast.success('Message')`, `Orion.toast.error('Message')`.
   - **Icons**: `<o-icon name="plus"></o-icon>`, `<o-icon name="trash"></o-icon>`, `<o-icon name="user"></o-icon>`, `<o-icon name="settings"></o-icon>`.

## Theme & Accessibility
- Set `<html lang="en" data-theme="auto">` for automatic light/dark/system mode switching.
- Always include accessible labels, button text, and proper `name` attributes on form inputs.
