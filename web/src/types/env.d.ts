/// <reference types="vite/client" />

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Shown in the browser tab. */
    title?: string
    /** Child screens that make no sense without a chosen child. */
    needsStudent?: boolean
  }
}

interface ImportMetaEnv {
  /** Full WebSocket URL of the engine, if it isn't proxied by Vite (default: same origin /ws). */
  readonly VITE_ENGINE_WS?: string
}
