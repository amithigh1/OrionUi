import { createApp } from 'vue';
import Orion from 'orion-admin';
import App from './App.vue';

createApp(App)
  .use(Orion.vue)          // adds this.$orion / inject('orion')
  .mount('#app');
