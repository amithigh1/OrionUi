/* <o-checklist tasks='[{"id":"profile","title":"Complete your profile","description":"Add a photo and bio","href":"/settings"},
 *                       {"id":"tour","title":"Take the tour","run":"startProductTour"}]'
 *              heading="Getting started" dismissible floating>
 * Onboarding checklist: progress ring, tasks that launch a tour/link/global function, persisted completion
 * (localStorage, keyed by `id`/a hash of the tasks) and an optional dismiss button. Call `el.complete(id)`
 * when a task's flow (e.g. a tour's onFinish) actually finishes it.
 *   Props: tasks(Array) heading id(persistence key) dismissible(=true) floating(=false) collapsed texts
 *   Methods: complete(id) uncomplete(id) toggle(id) reset() show() hide() isDone(id) progress()
 *   Events: o-task {task} (cancelable — prevent to stop the default link/run/tour action), o-complete {task},
 *           o-all-done {}, o-dismiss {}
 */
i18n.add('en', {
  checklist: {
    heading: 'Getting started', progress: '{done} of {total} completed', allDone: "You're all set!",
    dismiss: 'Dismiss checklist', collapse: 'Collapse', expand: 'Expand',
  },
});

function taskKey(cfgId, tasks) {
  if (cfgId) return 'orion:checklist:' + cfgId;
  const ids = toArr(tasks).map(t => t.id || t.key || t.title).join('|');
  let h2 = 0; for (let i = 0; i < ids.length; i++) h2 = (h2 * 31 + ids.charCodeAt(i)) | 0;
  return 'orion:checklist:' + Math.abs(h2).toString(36);
}

class OChecklist extends OElement {
  static props = {
    tasks: { type: Array, default: () => [] },
    heading: String,
    id: { type: String, attr: 'list-id' },
    dismissible: { type: Boolean, default: true },
    floating: { type: Boolean, reflect: true },
    collapsed: Boolean,
    texts: Object,
  };
  setup() {
    this.classList.add('o-checklist');
    this._done = new Set();
    this._dismissed = false;
    this.headerEl = h('div', { class: 'o-checklist-header' });
    this.listEl = h('ul', { class: 'o-checklist-list' });
    this.append(this.headerEl, this.listEl);
    on(this.headerEl, 'click', '[data-cl-toggle]', () => { this.collapsed = !this.collapsed; });
    on(this.headerEl, 'click', '[data-cl-dismiss]', () => this.dismiss());
    on(this.listEl, 'click', '.o-checklist-item', (e, li) => { if (!e.target.closest('[data-cl-check]')) this.runTask(li.dataset.id); });
    on(this.listEl, 'click', '[data-cl-check]', (e, cb) => { e.stopPropagation(); this.toggle(cb.closest('.o-checklist-item').dataset.id); });
  }
  connected() { this._loadPersisted(); this.render(); }
  update(changed) { if (changed.has('tasks') || changed.has('id')) { this._loadPersisted(); } this.render(); }
  _key() { return taskKey(this.id, this.tasks); }
  _loadPersisted() {
    const saved = ls.get(this._key(), null) || {};
    this._done = new Set(saved.done || toArr(this.tasks).filter(t => t.done).map(t => t.id));
    this._dismissed = !!saved.dismissed;
  }
  _save() { ls.set(this._key(), { done: [...this._done], dismissed: this._dismissed }); }

  get total() { return toArr(this.tasks).length; }
  doneCount() { return toArr(this.tasks).filter(t => this._done.has(t.id)).length; }
  isDone(id) { return this._done.has(id); }
  progress() { return this.total ? Math.round((this.doneCount() / this.total) * 100) : 0; }

  render() {
    if (this._dismissed) { this.hidden = true; return; }
    this.hidden = false;
    const pct = this.progress(), done = this.doneCount(), total = this.total, allDone = total > 0 && done === total;
    this.classList.toggle('is-collapsed', !!this.collapsed);
    this.classList.toggle('is-complete', allDone);
    this.headerEl.replaceChildren(...[
      h('button', { type: 'button', class: 'o-checklist-ring-btn', 'data-cl-toggle': '', 'aria-expanded': String(!this.collapsed) },
        h('span', { class: 'o-progress-ring o-checklist-ring', style: `--o-value:${pct};--o-size:2.5rem;--o-thickness:.25rem` }, allDone ? raw(String(icon('check', { size: 16 }))) : h('span', null, pct + '%'))),
      h('div', { class: 'o-checklist-headtext', 'data-cl-toggle': '' },
        h('b', null, this.heading || this.t('checklist.heading')),
        h('span', null, allDone ? this.t('checklist.allDone') : this.t('checklist.progress', { done, total }))),
      h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'data-cl-toggle': '', 'aria-label': this.collapsed ? this.t('checklist.expand') : this.t('checklist.collapse'), style: `transform:rotate(${this.collapsed ? 0 : 180}deg)` }, raw(String(icon('chevron-down', { size: 14 })))),
      this.dismissible ? h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'data-cl-dismiss': '', 'aria-label': this.t('checklist.dismiss') }, raw(String(icon('x', { size: 14 })))) : null,
    ].filter(Boolean));
    this.listEl.replaceChildren(...toArr(this.tasks).map(task => {
      const isDone = this._done.has(task.id);
      return h('li', { class: cls('o-checklist-item', isDone && 'is-done'), 'data-id': task.id, tabindex: '0', role: 'button', 'aria-pressed': String(isDone) },
        h('span', { class: 'o-checklist-check', 'data-cl-check': '' }, isDone ? raw(String(icon('check', { size: 12 }))) : null),
        h('div', { class: 'o-checklist-text' }, h('b', null, task.title), task.description ? h('span', null, task.description) : null));
    }));
  }
  runTask(id) {
    const task = toArr(this.tasks).find(t => t.id === id);
    if (!task || !this.emit('task', { task })) return;
    if (isFn(task.onClick)) task.onClick(task);
    else if (task.run) { const fn = getPath(win, task.run); if (isFn(fn)) fn(task); }
    else if (task.tourId && O.tour && isFn(O.tour.get) && O.tour.get(task.tourId)) O.tour.get(task.tourId).start();
    else if (task.href) win.location.href = task.href;
  }
  toggle(id) { this.isDone(id) ? this.uncomplete(id) : this.complete(id); }
  complete(id) {
    if (this._done.has(id)) return;
    this._done.add(id); this._save(); this.render();
    const task = toArr(this.tasks).find(t => t.id === id);
    this.emit('complete', { task });
    announce(this.t('checklist.progress', { done: this.doneCount(), total: this.total }));
    if (this.doneCount() === this.total) this.emit('all-done', {});
  }
  uncomplete(id) { if (!this._done.has(id)) return; this._done.delete(id); this._save(); this.render(); }
  dismiss() { this._dismissed = true; this._save(); this.render(); this.emit('dismiss', {}); }
  show() { this._dismissed = false; this._save(); this.render(); }
  hide() { this.dismiss(); }
  reset() { this._done.clear(); this._dismissed = false; this._save(); this.render(); }
}
define('o-checklist', OChecklist);
O.Checklist = OChecklist;
