import { useEffect, useRef, useState, useCallback } from 'react'
import type { SurveyResults } from './surveyApi'

// ── Types ──────────────────────────────────────────────────────────────────

type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface ResultsUpdateMessage {
  type: 'results_update'
  surveyId: string
  totalVoters: number
  questions: SurveyResults['questions']
}

interface SubscribedMessage {
  type: 'subscribed'
  surveyId: string
  message: string
}

type ServerMessage = ResultsUpdateMessage | SubscribedMessage | { type: 'pong' } | { type: 'error'; message: string }

// ── Constants ──────────────────────────────────────────────────────────────

// Derive WS base from current page origin at runtime (works in all envs)
const WS_BASE = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In dev, Vite proxies /ws to backend on :3001 — so we use the same host
  return `${proto}//${window.location.host}`
})()
const PING_INTERVAL_MS    = 25_000   // keepalive ping every 25 s
const RECONNECT_BASE_MS   = 1_500    // initial reconnect delay
const RECONNECT_MAX_MS    = 30_000   // max reconnect delay (exponential backoff cap)
const MAX_RECONNECT_TRIES = 8

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseResultsWebSocketReturn {
  /** Latest results pushed from server, or null while loading */
  liveResults: SurveyResults | null
  /** WebSocket connection status */
  wsStatus: WsStatus
  /** Human-readable connection label */
  wsLabel: string
  /** Timestamp of the last update received */
  lastUpdate: Date | null
  /** Force-reconnect (e.g. when user clicks a refresh button) */
  reconnect: () => void
}

/**
 * Manages a WebSocket connection to ws://.../ws/results/:surveyId.
 *
 * Features:
 *  - Automatic reconnect with exponential backoff
 *  - Keepalive ping/pong
 *  - Merges server push into local results state
 *  - Exposes connection status for UI indicators
 */
export function useResultsWebSocket(
  surveyId: string | undefined,
  /** Seed results from the HTTP response while WS is connecting */
  initialResults: SurveyResults | null = null
): UseResultsWebSocketReturn {
  const [liveResults, setLiveResults] = useState<SurveyResults | null>(initialResults)
  const [wsStatus,    setWsStatus]    = useState<WsStatus>('connecting')
  const [lastUpdate,  setLastUpdate]  = useState<Date | null>(null)

  const wsRef           = useRef<WebSocket | null>(null)
  const pingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriesRef      = useRef(0)
  const unmountedRef    = useRef(false)

  // Seed from parent whenever initialResults changes (e.g. after HTTP load)
  useEffect(() => {
    if (initialResults) setLiveResults(initialResults)
  }, [initialResults])

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!surveyId || unmountedRef.current) return

    // Close existing socket if any
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }

    setWsStatus('connecting')
    const url = `${WS_BASE}/ws/results/${surveyId}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      retriesRef.current = 0
      setWsStatus('connected')

      // Start keepalive ping
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage

        if (msg.type === 'results_update') {
          setLiveResults({
            surveyId:    msg.surveyId,
            title:       liveResults?.title ?? '',
            isPublic:    liveResults?.isPublic ?? true,
            totalVoters: msg.totalVoters,
            createdAt:   liveResults?.createdAt ?? new Date().toISOString(),
            questions:   msg.questions,
          })
          setLastUpdate(new Date())
        }
        // 'subscribed', 'pong' → no UI action needed
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onerror = () => {
      // onclose will fire right after, handle retry there
    }

    ws.onclose = (evt) => {
      if (unmountedRef.current) return

      // Clear ping timer
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }

      // Don't reconnect on intentional close (code 1000) or policy violation (1008)
      if (evt.code === 1000 || evt.code === 1008) {
        setWsStatus('disconnected')
        return
      }

      if (retriesRef.current >= MAX_RECONNECT_TRIES) {
        setWsStatus('disconnected')
        return
      }

      // Exponential backoff
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** retriesRef.current,
        RECONNECT_MAX_MS
      )
      retriesRef.current += 1
      setWsStatus('reconnecting')

      reconnectTimer.current = setTimeout(() => {
        if (!unmountedRef.current) connect()
      }, delay)
    }
  }, [surveyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false
    connect()

    return () => {
      unmountedRef.current = true

      if (pingTimerRef.current)   clearInterval(pingTimerRef.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)

      if (wsRef.current) {
        wsRef.current.onclose = null  // prevent reconnect on intentional teardown
        wsRef.current.close(1000, 'Component unmounted')
        wsRef.current = null
      }
    }
  }, [connect])

  // ── Status label ──────────────────────────────────────────────────────────

  const wsLabel =
    wsStatus === 'connected'    ? '🟢 Live'          :
    wsStatus === 'reconnecting' ? '🟡 Відновлення...' :
    wsStatus === 'connecting'   ? '🔵 Підключення...' :
                                  '🔴 Офлайн'

  return {
    liveResults,
    wsStatus,
    wsLabel,
    lastUpdate,
    reconnect: () => { retriesRef.current = 0; connect() },
  }
}
