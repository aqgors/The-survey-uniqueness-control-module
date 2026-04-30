import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SurveyResults } from './surveyApi'

// ── Types ──────────────────────────────────────────────────────────────────

type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface ResultsUpdateMessage extends SurveyResults {
  type: 'results_update'
}

interface SurveyUpdateMessage extends SurveyResults {
  type: 'survey_update'
}

interface SubscribedMessage {
  type: 'subscribed'
  surveyId: string
  message: string
}

interface SurveyDeletedMessage {
  type: 'survey_deleted'
  surveyId: string
}

type ServerMessage = ResultsUpdateMessage | SurveyUpdateMessage | SurveyDeletedMessage | SubscribedMessage | { type: 'pong' } | { type: 'error'; message: string }

// ── Constants ──────────────────────────────────────────────────────────────

const WS_BASE = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Connect to the generic /ws endpoint
  return `${proto}//${window.location.host}/ws`
})()
const PING_INTERVAL_MS    = 25_000   // keepalive ping every 25 s
const RECONNECT_BASE_MS   = 1_500    // initial reconnect delay
const RECONNECT_MAX_MS    = 30_000   // max reconnect delay (exponential backoff cap)
const MAX_RECONNECT_TRIES = 10

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseSurveyWebSocketReturn {
  /** Latest results pushed from server */
  liveResults: SurveyResults | null
  /** WebSocket connection status */
  wsStatus: WsStatus
  /** Human-readable connection label */
  wsLabel: string
  /** Timestamp of the last update received */
  lastUpdate: Date | null
  /** Force-reconnect */
  reconnect: () => void
}

/**
 * Manages a WebSocket connection to /ws for a specific survey.
 */
export function useSurveyWebSocket(
  surveyId: string | undefined,
  initialResults: SurveyResults | null = null,
  onSurveyUpdate?: (newSurvey: SurveyResults) => void,
  onSurveyDeleted?: () => void
): UseSurveyWebSocketReturn {
  const { t } = useTranslation()
  const [liveResults, setLiveResults] = useState<SurveyResults | null>(initialResults)
  const [wsStatus,    setWsStatus]    = useState<WsStatus>('connecting')
  const [lastUpdate,  setLastUpdate]  = useState<Date | null>(null)

  const wsRef           = useRef<WebSocket | null>(null)
  const pingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriesRef      = useRef(0)
  const unmountedRef    = useRef(false)

  useEffect(() => {
    if (initialResults) setLiveResults(initialResults)
  }, [initialResults])

  const onSurveyUpdateRef = useRef(onSurveyUpdate)
  useEffect(() => { onSurveyUpdateRef.current = onSurveyUpdate }, [onSurveyUpdate])

  const onSurveyDeletedRef = useRef(onSurveyDeleted)
  useEffect(() => { onSurveyDeletedRef.current = onSurveyDeleted }, [onSurveyDeleted])

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!surveyId || unmountedRef.current) return

    if (wsRef.current) {
      const oldWs = wsRef.current
      oldWs.onclose = null
      if (oldWs.readyState === WebSocket.CONNECTING) {
        oldWs.onopen = () => oldWs.close()
      } else if (oldWs.readyState === WebSocket.OPEN) {
        oldWs.close()
      }
    }

    setWsStatus('connecting')
    const ws = new WebSocket(`${WS_BASE}/results/${surveyId}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      retriesRef.current = 0
      setWsStatus('connected')

      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage

        if (msg.type === 'results_update' || msg.type === 'survey_update') {
          let merged: SurveyResults | null = null;
          setLiveResults(prev => {
            const base = prev || initialResults;
            if (!base) return null;
            merged = {
              ...base,
              ...(msg.title !== undefined && { title: msg.title }),
              ...(msg.description !== undefined && { description: msg.description }),
              ...(msg.imageUrl !== undefined && { imageUrl: msg.imageUrl }),
              ...(msg.isPrivate !== undefined && { isPrivate: msg.isPrivate }),
              ...((msg as any).accessType !== undefined && { accessType: (msg as any).accessType }),
              ...((msg as any).isActive !== undefined && { isActive: (msg as any).isActive }),
              ...(msg.deadline !== undefined && { deadline: msg.deadline }),
              ...(msg.createdById !== undefined && { createdById: msg.createdById }),
              ...(msg.totalVoters !== undefined && { totalVoters: msg.totalVoters }),
              ...(msg.createdAt !== undefined && { createdAt: msg.createdAt }),
              ...(msg.voters !== undefined && { voters: msg.voters }),
              ...(msg.questions !== undefined && { questions: msg.questions }),
            } as SurveyResults;
            return merged;
          });
          setLastUpdate(new Date());
          
          if (msg.type === 'survey_update' && onSurveyUpdateRef.current && merged) {
            onSurveyUpdateRef.current(merged);
          }
        } else if (msg.type === 'survey_deleted') {
          if (onSurveyDeletedRef.current) {
            onSurveyDeletedRef.current()
          }
        }
      } catch {
        // Ignore
      }
    }

    ws.onclose = (evt) => {
      if (unmountedRef.current) return
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)

      if (evt.code === 1000 || evt.code === 1008) {
        setWsStatus('disconnected')
        return
      }

      if (retriesRef.current >= MAX_RECONNECT_TRIES) {
        setWsStatus('disconnected')
        return
      }

      const delay = Math.min(RECONNECT_BASE_MS * 2 ** retriesRef.current, RECONNECT_MAX_MS)
      retriesRef.current += 1
      setWsStatus('reconnecting')

      reconnectTimer.current = setTimeout(() => {
        if (!unmountedRef.current) connect()
      }, delay)
    }
  }, [surveyId])

  useEffect(() => {
    unmountedRef.current = false
    connect()

    return () => {
      unmountedRef.current = true
      if (pingTimerRef.current)   clearInterval(pingTimerRef.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        const wsToClose = wsRef.current
        wsToClose.onclose = null
        if (wsToClose.readyState === WebSocket.CONNECTING) {
          wsToClose.onopen = () => wsToClose.close(1000, 'Component unmounted')
        } else if (wsToClose.readyState === WebSocket.OPEN) {
          wsToClose.close(1000, 'Component unmounted')
        }
        wsRef.current = null
      }
    }
  }, [connect])

  const wsLabel =
    wsStatus === 'connected'    ? '🟢 Live'          :
    wsStatus === 'reconnecting' ? `🟡 ${t('system.ws.reconnecting')}` :
    wsStatus === 'connecting'   ? `🔵 ${t('system.ws.connecting')}` :
                                  '🔴 Офлайн'

  return {
    liveResults,
    wsStatus,
    wsLabel,
    lastUpdate,
    reconnect: () => { retriesRef.current = 0; connect() },
  }
}
