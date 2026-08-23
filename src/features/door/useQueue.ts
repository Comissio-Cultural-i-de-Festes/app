import { useCallback, useEffect, useState } from 'react'

import { count as queueCount } from '@/lib/queue'

import { flushQueue } from './api'

/**
 * How many scans are still waiting, and getting them sent.
 *
 * Shared by both door screens rather than living on the scanner, because a
 * night can be run entirely from the manual list — a flat battery, a QR that
 * will not read — and a queue that only drains on a screen nobody opened is a
 * queue that never drains.
 */
export interface QueueState {
  readonly queued: number
  readonly online: boolean
  readonly refresh: () => void
}

const RETRY_MS = 20_000

export function useQueue(): QueueState {
  const [queued, setQueued] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)

  const refresh = useCallback(() => {
    void queueCount().then(setQueued)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const drain = () => {
      void flushQueue().then(refresh)
    }
    const wentOnline = () => {
      setOnline(true)
      drain()
    }
    const wentOffline = () => {
      setOnline(false)
    }

    window.addEventListener('online', wentOnline)
    window.addEventListener('offline', wentOffline)
    // `online` fires on a change, not on a recovery the browser did not
    // notice — a captive portal, a tunnel — so there is a slow poll behind it.
    const timer = window.setInterval(() => {
      if (navigator.onLine) drain()
    }, RETRY_MS)

    return () => {
      window.removeEventListener('online', wentOnline)
      window.removeEventListener('offline', wentOffline)
      window.clearInterval(timer)
    }
  }, [refresh])

  return { queued, online, refresh }
}
