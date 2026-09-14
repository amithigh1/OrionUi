import { createApp, ref } from 'vue/dist/vue.esm-bundler.js';
import { defineTestElement, type } from './fwtest-element.js';

const Orion = window.Orion;
defineTestElement(Orion);
const state = {};
const app = createApp({
  setup() {
    const val = ref('hello'), rows = ref([]), items = ref(['x', 'y']), config = ref({ a: 1 });
    Object.assign(state, { val, rows });
    return { val, rows, items, config, fmt: v => String(v).toUpperCase(), onRow: e => rows.value.push(e.detail.id) };
  },
  template: `<div>
    <o-fwtest v-model="val" :items="items" :config="config" :fmt="fmt" name="nick" class="my-class" @o-row-click="onRow"><span class="kid">child</span></o-fwtest>
    <o-avatar name="Ada Lovelace" size="lg"></o-avatar>
    <output id="val">{{ val }}</output><output id="rows">{{ rows.join(',') }}</output>
  </div>`,
});
app.use(Orion.vue);
app.mount('#root');

window.runTest = async () => {
  await new Promise(r => setTimeout(r, 100));
  const el = document.querySelector('o-fwtest'), res = {};
  res.noVueWarnUnknown = !window.__vueWarn;
  res.items = Array.isArray(el.items) && el.items.join() === 'x,y';
  res.config = el.config && el.config.a === 1;
  res.fn = typeof el.fmt === 'function' && el.fmt('a') === 'A';
  res.initialValue = el.value === 'hello' && el.querySelector('#inner').value === 'hello';
  res.children = !!el.querySelector('.kid');
  type(el, 'world');
  await new Promise(r => setTimeout(r, 50));
  res.vModelIn = document.getElementById('val').textContent === 'world';
  state.val.value = 'from-vue';
  await new Promise(r => setTimeout(r, 50));
  res.vModelOut = el.value === 'from-vue' && el.querySelector('#inner').value === 'from-vue';
  document.getElementById('rowbtn').click();
  await new Promise(r => setTimeout(r, 50));
  res.customEvent = document.getElementById('rows').textContent === '7';
  res.globalProp = !!app.config.globalProperties.$orion;
  return res;
};
