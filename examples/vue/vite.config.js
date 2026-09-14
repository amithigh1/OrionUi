import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Tell the Vue compiler that <o-*> tags are custom elements, not Vue components.
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('o-') } } })],
});
