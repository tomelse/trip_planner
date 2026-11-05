import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import { store } from './lib/store.svelte'

mount(App, { target: document.getElementById('app')! })

const HOUR = 60 * 60 * 1000

// Offline support. A new version waits until you say so, so an update never reloads the page under you mid-edit.
const offerUpdate = () => store.notify('A new version is ready', () => update(true), 'Reload')

const update = registerSW({
  onNeedRefresh: offerUpdate,
  onOfflineReady: () => store.notify('Ready to work offline'),
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Browsers only look for a new version when the page loads, and an installed app resumed from the background
    // doesn't reload. So also check whenever the app comes back into view, when the connection returns, and hourly.
    const check = () => {
      registration.update().catch(() => {}) // offline or server unreachable: try again next time
      if (registration.waiting) offerUpdate() // downloaded earlier but not applied yet (the prompt may have been missed)
    }
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    window.addEventListener('online', check)
    setInterval(check, HOUR)
  },
})
