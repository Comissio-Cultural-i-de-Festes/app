import { useCallback, useEffect, useState } from 'react'

import { flushIdeas, queuedIdeas } from './api'

/**
 * Ideas written down with no signal, and getting them sent.
 *
 * The same shape as the door's queue and for a smaller reason: nobody is
 * standing in front of you, but an idea typed on a train and lost to a tunnel
 * is an idea nobody types twice.
 *
 * Lives on the list screen rather than the form, because the form is closed
 * the moment somebody presses publish — a queue that only drains on a screen
 * nobody has open is a queue that never drains.
 */

const RETRY_MS = 20_000

export interface IdeaQueue {
  readonly queued: number
  readonly online: boolean
  readonly refresh: () => void
}

export function useIdeaQueue(onSent: () => void): IdeaQueue {
  const [queued, setQueued] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)

  const refresh = useCallback(() => {
    void queuedIdeas().then(setQueued)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const drain = () => {
      void flushIdeas().then((sent) => {
        refresh()
        // Only when something actually moved: refetching the list on every
        // twenty-second tick would be a request nobody asked for.
        if (sent > 0) onSent()
      })
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
    // notice — a tunnel, a captive portal — so there is a slow poll behind it.
    const timer = window.setInterval(() => {
      if (navigator.onLine) drain()
    }, RETRY_MS)

    return () => {
      window.removeEventListener('online', wentOnline)
      window.removeEventListener('offline', wentOffline)
      window.clearInterval(timer)
    }
  }, [refresh, onSent])

  return { queued, online, refresh }
}
