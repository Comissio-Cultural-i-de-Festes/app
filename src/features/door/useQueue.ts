import { useCallback, useEffect, useState } from 'react'

import { pending, usable } from '@/lib/queue'

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
  /** Waiting to be sent. */
  readonly queued: number
  /** Set aside because the server said no for good. Somebody has to look. */
  readonly refused: number
  /**
   * Whether this phone can write the queue at all. False means a scan with no
   * signal goes nowhere, and the junta should know before the first one.
   */
  readonly usable: boolean
  readonly online: boolean
  readonly refresh: () => void
}

const RETRY_MS = 20_000

export function useQueue(): QueueState {
  const [counts, setCounts] = useState({ queued: 0, refused: 0 })
  const [canWrite, setCanWrite] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)

  // The rows and not `count()`: the refused ones are in the same store and are
  // not waiting for anything, so a single number would count them as queued.
  const refresh = useCallback(() => {
    void pending().then((rows) => {
      const refused = rows.filter((row) => row.refused !== undefined).length
      setCounts({ queued: rows.length - refused, refused })
    })
    void usable().then(setCanWrite)
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

  return { ...counts, usable: canWrite, online, refresh }
}

/**
 * The line beside the count on both door screens, or null when all is well.
 *
 * A queue that cannot be written comes first, whatever the count says: "0 a
 * la cua, sense xarxa" reads as a door that is coping, and with no queue it is
 * a door where every scan goes nowhere. Those two keys take no count — they
 * are not plurals, and passing one would send i18next looking for `_one`.
 */
export function queueNotice(
  state: QueueState,
): { readonly key: string; readonly params: { count?: number } } | null {
  if (!state.usable) {
    return { key: state.online ? 'door.noQueue' : 'door.noQueueOffline', params: {} }
  }
  if (state.queued === 0 && state.online) return null
  return {
    key: state.online ? 'door.queued' : 'door.queuedOffline',
    params: { count: state.queued },
  }
}
