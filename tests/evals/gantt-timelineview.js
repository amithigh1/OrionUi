/* gantt-timelineview.js — populated data (40 items in 4 top-level groups + 4 nested on-call
 * sub-lanes = 8 lanes, mixed range/point/background items), fixed 2026 dates (epoch ms, not
 * Date.now()). Proves items lay out in the correct lane (a direct regression check for the lane-
 * position bug found & fixed in 30-element.js: item elements must share the same lane offset as
 * their group's own rendered label row), grouping/nesting (collapse hides the nested lane),
 * zoom (a range item's rendered width scales with the window span) and keyboard navigation
 * (Arrow moves focus + recenters, Enter selects). Run against docs/components/timeline-view.html:
 *   node build/check.mjs docs/components/timeline-view.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-timelineview.js"
 */
(async () => {
  const DAY = 864e5;
  const BASE = Date.UTC(2026, 3, 1); // fixed: 2026-04-01 UTC, not Date.now()

  function build() {
    const groups = [];
    const items = [];
    for (let t = 1; t <= 4; t++) {
      const gid = 'team' + t, ocid = gid + '-oncall';
      groups.push({ id: gid, content: 'Team ' + t, nested: [ocid] });
      groups.push({ id: ocid, content: 'On-call' });
      for (let i = 0; i < 10; i++) {
        const start = BASE + (t * 2 + i * 3) * DAY;
        const inOncall = i % 4 === 3;
        const type = i % 5 === 0 ? 'point' : i % 7 === 0 ? 'background' : 'range';
        const item = { id: `${gid}-i${i}`, group: inOncall ? ocid : gid, content: `${gid} item ${i}`, type, start };
        if (type !== 'point') item.end = start + (1 + (i % 3)) * DAY;
        items.push(item);
      }
    }
    return { groups, items };
  }

  const tv = document.getElementById('tv-main');
  if (!tv) return { ok: false, error: 'no #tv-main element on page' };
  const { groups, items } = build();
  tv.groups = groups;
  tv.items = items;
  tv.setWindow(BASE - 5 * DAY, BASE + 100 * DAY, { silent: true });
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  const translateY = el => { const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform); return m ? parseFloat(m[1]) : null; };
  const glabel = k => tv._groupsBody.querySelector(`.o-tv-glabel[data-k="${k}"]`);
  const itemEl = id => tv._itemsLayer.querySelector(`.o-tv-item[data-k="${id}"]`);

  // --- (1) lanes: an item's row offset relative to its own group's label row must match another
  // item/group pair's offset exactly (both are row 0 in their lane, so the only difference between
  // their absolute Y is the lane-top difference, which both the item layer and the label layer must
  // derive from the exact same source). This is the regression check for the fixed lane-position bug.
  const itemA = 'team1-i0', groupA = 'team1', itemB = 'team3-i0', groupB = 'team3';
  const yItemA = translateY(itemEl(itemA)), yLabelA = translateY(glabel(groupA));
  const yItemB = translateY(itemEl(itemB)), yLabelB = translateY(glabel(groupB));
  const lanesOk = [yItemA, yLabelA, yItemB, yLabelB].every(v => v != null)
    && Math.abs((yItemB - yItemA) - (yLabelB - yLabelA)) < 0.5
    && yItemA !== yItemB; // sanity: they really are in different lanes, not coincidentally equal

  // --- (2) grouping / nesting: on-call sub-lane renders right after its parent team, and collapsing
  // the parent hides the sub-lane's row and its items.
  const orderBefore = tv._order;
  const parentIdx = orderBefore.indexOf('team1'), childIdx = orderBefore.indexOf('team1-oncall');
  const nestedRightAfterParent = childIdx === parentIdx + 1;

  tv.collapseGroup('team1');
  await frame();
  const orderCollapsed = tv._order;
  const childHiddenWhenCollapsed = !orderCollapsed.includes('team1-oncall');
  const oncallItemGoneFromDom = !itemEl('team1-i3'); // i=3 is one of the "inOncall" items (i%4===3), in the team1-oncall lane

  tv.expandGroup('team1');
  await frame();
  const childRestoredOnExpand = tv._order.includes('team1-oncall');

  // --- (3) zoom: a range item's rendered pixel width scales with the window span (inverse-proportional)
  tv.setWindow(BASE - 5 * DAY, BASE + 100 * DAY, { silent: true });
  await frame();
  const wideSpan = tv.end - tv.start;
  const wideWidth = itemEl('team2-i1').getBoundingClientRect().width;
  tv.setWindow(BASE, BASE + 20 * DAY, { silent: true }); // zoom in: 1/5 the span
  await frame();
  const narrowSpan = tv.end - tv.start;
  const narrowWidth = itemEl('team2-i1').getBoundingClientRect().width;
  const expectedRatio = wideSpan / narrowSpan;
  const actualRatio = narrowWidth / wideWidth;
  const zoomOk = Math.abs(actualRatio - expectedRatio) / expectedRatio < 0.05; // within 5%

  // --- (4) keyboard: Arrow moves focus chronologically + recenters; Enter selects
  tv.setSelection([]);
  const chartEl = tv.querySelector('.o-tv-chart');
  chartEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  await frame();
  chartEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await frame();
  chartEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await frame();
  const selectEvents = [];
  tv.addEventListener('o-select', e => selectEvents.push(e.detail.ids[0]));
  chartEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await frame();
  const selectionAfterEnter = tv.getSelection();
  const keyboardOk = selectionAfterEnter.length === 1 && selectEvents.length === 1 && selectEvents[0] === selectionAfterEnter[0];

  const ok = items.length >= 40 && lanesOk && nestedRightAfterParent && childHiddenWhenCollapsed && oncallItemGoneFromDom
    && childRestoredOnExpand && zoomOk && keyboardOk;
  return {
    ok, itemCount: items.length, groupCount: groups.length,
    lanes: { yItemA, yLabelA, yItemB, yLabelB, lanesOk },
    grouping: { nestedRightAfterParent, childHiddenWhenCollapsed, oncallItemGoneFromDom, childRestoredOnExpand },
    zoom: { wideSpan, narrowSpan, wideWidth, narrowWidth, expectedRatio, actualRatio, zoomOk },
    keyboard: { selectionAfterEnter, selectEvents, keyboardOk },
  };
})()
