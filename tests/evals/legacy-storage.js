/* legacy-storage.js — salvaged from .tmp/storage-eval.js (docs/components/storage.html).
 * Orion.store (get/set/ttl/onChange incl. cross-tab storage-event), Orion.session, Orion.idb (add/get/count/
 * index/tx), and Orion.cache (put/match/has/delete).
 */
(async () => {
  const out = {};
  Orion.store.clear();
  Orion.store.set('filters', { status: 'active' });
  out.getSet = Orion.store.get('filters');
  Orion.store.set('shortlived', 'x', { ttl: 30 });
  out.ttlPresent = Orion.store.has('shortlived');
  out.ttlRemaining = Orion.store.ttl('shortlived') > 0;
  await new Promise(r => setTimeout(r, 60));
  out.ttlExpired = !Orion.store.has('shortlived');

  let changeFired = null;
  const off = Orion.store.onChange('filters', (v, old, info) => { changeFired = { v, source: info.source }; });
  Orion.store.set('filters', { status: 'inactive' });
  await new Promise(r => setTimeout(r, 10));
  out.localChange = changeFired;
  changeFired = null;
  window.dispatchEvent(new StorageEvent('storage', { key: 'orion:store:filters', oldValue: JSON.stringify({ status: 'inactive' }), newValue: JSON.stringify({ status: 'remote' }), storageArea: localStorage }));
  await new Promise(r => setTimeout(r, 10));
  out.remoteChange = changeFired;
  off();

  Orion.session.set('tmp', 1);
  out.session = Orion.session.get('tmp');

  const db = await Orion.idb.open('docs-test-db-' + Date.now(), { stores: { items: { keyPath: 'id', autoIncrement: true, indexes: ['tag'] } } });
  const id = await db.add('items', { tag: 'a', label: 'One' });
  await db.add('items', { tag: 'b', label: 'Two' });
  out.idbGet = await db.get('items', id);
  out.idbCount = await db.count('items');
  out.idbIndex = await db.index('items', 'tag').getAll('a');
  await db.tx(['items'], 'readwrite', async t => { await t.store('items').put({ id, tag: 'a', label: 'One-updated' }); });
  out.idbAfterTx = (await db.get('items', id)).label;
  await db.destroy();

  await Orion.cache.put('/docs-test/data', { hello: 'world' }, { ttl: 60000 });
  out.cacheMatch = await Orion.cache.match('/docs-test/data');
  out.cacheHas = await Orion.cache.has('/docs-test/data');
  await Orion.cache.delete('/docs-test/data');
  out.cacheAfterDelete = await Orion.cache.match('/docs-test/data');

  out.estimate = await Orion.storage.estimate();

  const ok = out.getSet && out.getSet.status === 'active'
    && out.ttlPresent && out.ttlRemaining && out.ttlExpired
    && !!out.localChange && out.localChange.source === 'local' && out.localChange.v.status === 'inactive'
    && !!out.remoteChange && out.remoteChange.source === 'remote' && out.remoteChange.v.status === 'remote'
    && out.session === 1
    && out.idbGet && out.idbGet.label === 'One' && out.idbCount === 2 && out.idbIndex.length === 1
    && out.idbAfterTx === 'One-updated'
    && out.cacheHas === true && !!out.cacheMatch && out.cacheMatch.hello === 'world' && out.cacheAfterDelete == null;
  return { ok, ...out };
})()
