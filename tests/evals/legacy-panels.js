/* legacy-panels.js — salvaged from .tmp/panels-eval.js (docs/components/tabs.html).
 * Covers four layout components built entirely from dynamically-created markup (no page fixture required):
 * <o-tabs> (keyboard activation, closable/addable, lazy render, hash deep link), <o-accordion>
 * (single vs multiple), <o-faq> (search filter) and <o-split> (keyboard + pointer-drag resize, persistence).
 */
(async () => {
  const out = {};

  // ---- o-tabs ----
  const tabs = document.createElement('o-tabs');
  tabs.setAttribute('closable', ''); tabs.setAttribute('addable', ''); tabs.setAttribute('reorderable', ''); tabs.setAttribute('lazy', ''); tabs.setAttribute('hash', 'ptab');
  tabs.innerHTML = `
    <o-tab-panel id="t1" label="One"><template>Content ONE</template></o-tab-panel>
    <o-tab-panel id="t2" label="Two"><template>Content TWO</template></o-tab-panel>
    <o-tab-panel id="t3" label="Three"><template>Content THREE</template></o-tab-panel>`;
  document.body.appendChild(tabs);
  await new Promise(r => setTimeout(r, 30));

  out.initialSelected = tabs.selectedId;
  // activation="auto" (the default) moves focus AND selection together on arrow keys, relative to the
  // currently FOCUSED tab — so the key must be dispatched from the tab that's actually selected (t1),
  // not from a tab focused via a plain .focus() call (which does not itself activate anything).
  const tab1 = [...tabs.querySelectorAll('[role=tab]')][0];
  tab1.focus();
  tab1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
  out.afterArrowRight = tabs.selectedId;
  out.lazyRenderedOnShow = tabs._items.find(d => d.id === 't2').panel.textContent.includes('Content TWO');
  out.lazyThirdNotRendered = !tabs._items.find(d => d.id === 't3').panel.textContent.includes('Content THREE');
  out.hashAfterSelect = location.hash;

  const activeTab = tabs.querySelector('[role=tab][aria-selected=true]');
  activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
  out.afterDeleteCount = tabs.getTabs().length;

  const addId = tabs.add({ label: 'New', select: true });
  await new Promise(r => setTimeout(r, 20));
  out.afterAddCount = tabs.getTabs().length;
  out.newSelected = tabs.selectedId === addId;
  location.hash = '';
  tabs.remove();

  // ---- o-accordion ----
  const acc = document.createElement('o-accordion');
  acc.innerHTML = `<o-accordion-item id="a1" heading="A">Body A</o-accordion-item><o-accordion-item id="a2" heading="B">Body B</o-accordion-item>`;
  document.body.appendChild(acc);
  await new Promise(r => setTimeout(r, 20));
  const item1 = acc.querySelector('#a1'), item2 = acc.querySelector('#a2');
  await item1.show();
  await item2.show();
  out.singleModeClosesOther = !item1.expanded && item2.expanded;
  acc.multiple = true;
  await new Promise(r => setTimeout(r, 10));
  await item1.show();
  out.multipleAllowsBoth = item1.expanded && item2.expanded;
  acc.remove();

  // ---- o-faq ----
  const faq = document.createElement('o-faq');
  faq.searchable = true;
  faq.innerHTML = `<o-accordion-item heading="How do refunds work?">We refund within 30 days.</o-accordion-item><o-accordion-item heading="What is the pricing?">See our pricing page.</o-accordion-item>`;
  document.body.appendChild(faq);
  await new Promise(r => setTimeout(r, 30));
  faq.search('refund');
  await new Promise(r => setTimeout(r, 200));
  out.faqFilteredCount = faq.items.filter(i => !i.hidden).length;
  faq.search('');
  await new Promise(r => setTimeout(r, 200));
  out.faqUnfilteredCount = faq.items.filter(i => !i.hidden).length;
  faq.remove();

  // ---- o-split ----
  localStorage.removeItem('orion:split:ptest');
  const split = document.createElement('o-split');
  split.setAttribute('persist', 'ptest');
  split.style.cssText = 'width:400px;height:200px;display:flex';
  split.innerHTML = '<div>A</div><div>B</div>';
  document.body.appendChild(split);
  await new Promise(r => setTimeout(r, 30));
  const gutter = split.querySelector('.o-split-gutter');
  gutter.focus();
  const before1 = split.getSizes();
  gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
  out.keyboardResized = JSON.stringify(split.getSizes()) !== JSON.stringify(before1);
  out.persistedToStorage = !!localStorage.getItem('orion:split:ptest');

  const gRect = gutter.getBoundingClientRect();
  gutter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: gRect.left + 4, clientY: gRect.top + 4, button: 0 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: gRect.left + 60, clientY: gRect.top + 4 }));
  await new Promise(r => setTimeout(r, 30));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: gRect.left + 60, clientY: gRect.top + 4 }));
  await new Promise(r => setTimeout(r, 30));
  const afterDrag = split.getSizes();
  out.dragResized = JSON.stringify(afterDrag) !== JSON.stringify(before1);
  split.remove();
  localStorage.removeItem('orion:split:ptest');

  const ok = out.afterArrowRight === 't2' && out.lazyRenderedOnShow && out.lazyThirdNotRendered
    && out.afterDeleteCount === 2 && out.afterAddCount === 3 && out.newSelected
    && out.singleModeClosesOther && out.multipleAllowsBoth
    && out.faqFilteredCount === 1 && out.faqUnfilteredCount === 2
    && out.keyboardResized && out.persistedToStorage && out.dragResized;
  return { ok, ...out };
})()
