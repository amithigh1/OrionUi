(async () => {
  // Orion.http.mock must accept all three documented route forms and must NOT turn an unsupported value into a
  // catch-all route (that once made every request through Orion.http resolve to an empty 200 — see STATUS.md).
  const out = {};
  const servers = [];
  const origFetch = window.fetch;
  let realFetches = 0;
  window.fetch = async (input, init) => { realFetches++; return new Response('passthrough', { status: 200 }); };
  try {
    // 1. array of route objects
    servers.push(Orion.http.mock([{ method: 'GET', url: '/mock-forms/obj', response: { form: 'object' } }]));
    // 2. object form
    servers.push(Orion.http.mock({ 'GET /mock-forms/map': () => ({ form: 'map' }) }));
    // 3. tuple form (what the docs pages use)
    servers.push(Orion.http.mock([['GET /mock-forms/tuple', ({ query }) => ({ form: 'tuple', page: +query.page })]]));

    // 4. repeated query keys reach the handler as arrays
    servers.push(Orion.http.mock({ 'GET /mock-forms/arr': ({ query }) => ({ b: query.b, a: query.a }) }));
    const arr = await Orion.http.get('/mock-forms/arr?a=1&b=2&b=3');
    out.repeatedQueryKeys = arr.a === '1' && Array.isArray(arr.b) && arr.b.join() === '2,3';
    out.objectForm = (await Orion.http.get('/mock-forms/obj')).form === 'object';
    out.mapForm = (await Orion.http.get('/mock-forms/map')).form === 'map';
    const t = await Orion.http.get('/mock-forms/tuple?page=3');
    out.tupleForm = t.form === 'tuple' && t.page === 3;
    // unmatched URLs must still pass through to the network (here: the stubbed fetch), not hit a catch-all
    const p = await Orion.http.get('/mock-forms/none', { responseType: 'text' });
    out.passthrough = p === 'passthrough' && realFetches === 1;
    // garbage is rejected loudly instead of becoming a '*' route
    let threw = false;
    try { Orion.http.mock(['GET /mock-forms/bad', 42, 'nope']); } catch (e) { threw = e instanceof TypeError; }
    out.garbageRejected = threw;
  } catch (e) { out.error = String(e && e.message || e); }
  finally {
    window.fetch = origFetch;
    servers.forEach(s => s.restore && s.restore());
  }
  out.ok = !!(out.objectForm && out.mapForm && out.tupleForm && out.repeatedQueryKeys && out.passthrough && out.garbageRejected && !out.error);
  return out;
})()
