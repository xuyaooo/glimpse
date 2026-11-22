import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import 'katex/dist/katex.min.css'
import './style.css'

createApp(App).use(router).mount('#app')

// Development: window.__glimpse gives the app state, for testing in the browser console.
if (import.meta.env.DEV) {
  Promise.all([import('./lib/engine'), import('./lib/ui'), import('./lib/settings'), import('./lib/player')]).then(([engine, ui, settings, player]) => {
    Object.assign(window, { __glimpse: { state: engine.state, ui: ui.ui, settings: settings.settings, engine, player: player.player, anim: player } })
  })
}
