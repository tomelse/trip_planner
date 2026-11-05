import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import { store } from './lib/store.svelte'

mount(App, { target: document.getElementById('app')! })

// Offline support. A new version waits until you say so, so an update never reloads the page under you mid-edit.
const update = registerSW({
  onNeedRefresh: () => store.notify('A new version is ready', () => update(true), 'Reload'),
  onOfflineReady: () => store.notify('Ready to work offline'),
})
