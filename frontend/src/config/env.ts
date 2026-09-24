/**
 * Runtime API / WebSocket endpoints.
 *
 * Defaults are SAME-ORIGIN: the backend serves this bundle, so `/api` and
 * `ws(s)://<current host>/ws/state` always resolve to the server that served the
 * page. The previous absolute `http://localhost:8000` defaults silently made every
 * request cross-origin as soon as the app was opened through 127.0.0.1, a LAN IP,
 * a tunnel or a different port — adding a CORS preflight to every mutation and
 * failing outright under HTTPS (mixed content) or a tightened CORS policy.
 *
 * Override with VITE_API_BASE_URL / VITE_WS_BASE_URL when the API lives elsewhere.
 * `npm run dev` keeps working through the Vite proxy configured in vite.config.ts.
 */
const isBrowser = typeof window !== 'undefined'

const sameOriginApi =
  isBrowser ? `${window.location.origin}/api` : 'http://localhost:8000/api'

const sameOriginWs = isBrowser
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/state`
  : 'ws://localhost:8000/ws/state'

export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || sameOriginApi,
  WS_BASE_URL: import.meta.env.VITE_WS_BASE_URL || sameOriginWs,
  IS_DEV_PREVIEW: import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true',
} as const
