import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { defineTestElement, type } from './fwtest-element.js';

const Orion = window.Orion;
defineTestElement(Orion);
const { Fwtest, Avatar } = Orion.react(React);
const h = React.createElement;
const results = {};

function App() {
  const [val, setVal] = useState('hello');
  const [rows, setRows] = useState([]);
  const ref = useRef(null);
  window.__ref = ref;
  return h('div', null,
    h(Fwtest, {
      ref, items: ['x', 'y'], config: { a: 1 }, fmt: v => String(v).toUpperCase(), value: val, name: 'nick',
      onChange: e => setVal(e.detail.value), onRowClick: e => setRows(r => [...r, e.detail.id]),
      className: 'my-class', 'data-test': '1', onClick: () => { window.__clicked = (window.__clicked || 0) + 1; },
    }, h('span', { className: 'kid' }, 'child')),
    h(Avatar, { name: 'Ada Lovelace', size: 'lg', status: 'online' }),
    h('output', { id: 'val' }, val),
    h('output', { id: 'rows' }, rows.join(',')),
  );
}
createRoot(document.getElementById('root')).render(h(App));

window.runTest = async () => {
  await new Promise(r => setTimeout(r, 100));
  const el = document.querySelector('o-fwtest');
  results.isElement = el === window.__ref.current;
  results.items = Array.isArray(el.items) && el.items.join() === 'x,y';
  results.config = el.config && el.config.a === 1;
  results.fn = typeof el.fmt === 'function' && el.fmt('a') === 'A';
  results.initialValue = el.value === 'hello' && el.querySelector('#inner').value === 'hello';
  results.className = el.classList.contains('my-class');
  results.dataAttr = el.getAttribute('data-test') === '1';
  results.children = !!el.querySelector('.kid');
  type(el, 'world');
  await new Promise(r => setTimeout(r, 50));
  results.stateUpdated = document.getElementById('val').textContent === 'world';
  document.getElementById('rowbtn').click();
  await new Promise(r => setTimeout(r, 50));
  results.customEvent = document.getElementById('rows').textContent === '7';
  results.nativeClick = window.__clicked >= 1;
  results.avatar = document.querySelector('o-avatar')?.textContent === 'AL';
  return results;
};
