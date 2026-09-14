/**
 * Debounced search box that queries a REST endpoint.
 * @param {HTMLInputElement} input
 */
export function searchBox(input, { url = '/api/search', delay = 250 } = {}) {
  let timer = 0, controller = null;
  const results = document.querySelector('#results');

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      const q = input.value.trim();
      if (q.length < 2) return (results.textContent = '');
      try {
        const res = await fetch(`${url}?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        results.replaceChildren(...data.items.map(item => {
          const li = document.createElement('li');
          li.textContent = `${item.name} — ${item.count} matches`;
          return li;
        }));
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Search failed', err);
      }
    }, delay);
  });
  return () => { clearTimeout(timer); controller?.abort(); };
}
