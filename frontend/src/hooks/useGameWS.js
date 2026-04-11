// useGameWS.js — shared WebSocket hook for all games
// Handles: connect, reconnect on close, mountedRef guard, cleanup on unmount
//
// Usage:
//   const { send } = useGameWS(WS_URL, player, (data) => { setState(data); ... })
//
// The onMessage callback receives already-parsed JSON.
// Optional onOpen callback fires when the socket opens.

import { useEffect, useRef, useCallback } from 'react'

export function useGameWS(url, player, onMessage, onOpen) {
  const wsRef      = useRef(null)
  const mountedRef = useRef(true)

  // Stable refs so connect() closure never goes stale
  const onMessageRef = useRef(onMessage)
  const onOpenRef    = useRef(onOpen)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onOpenRef.current    = onOpen    }, [onOpen])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const ws = new WebSocket(`${url}/${player}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      onOpenRef.current?.()
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      let data
      try { data = JSON.parse(e.data) } catch { return }
      onMessageRef.current(data)
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setTimeout(connect, 2000)
    }

    ws.onerror = () => ws.close()
  }, [url, player])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((msg) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  // Expose wsRef for games that need direct access (e.g. canvas games checking readyState)
  return { send, wsRef, mountedRef }
}
