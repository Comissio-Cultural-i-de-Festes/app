import { type RefObject, useEffect, useState } from 'react'

import type { CameraError } from '@/features/door/useCamera'

/**
 * The camera, pointed at you.
 *
 * Not `useCamera`: that one exists to run a QR detector on every frame, which
 * is the most expensive thing this app does and exactly what this screen must
 * not do. What is left once the detector goes is short enough to read in one
 * go, and keeping it separate means the door's loop cannot be broken from here.
 *
 * The stream is not handed back either — the frame is read off the `<video>`
 * element by `captureFrame`, so there is nothing for a caller to do with a
 * `MediaStream` except forget to stop it.
 */
export function useSelfie(
  videoRef: RefObject<HTMLVideoElement | null>,
  facing: 'user' | 'environment',
): CameraError | null {
  const [error, setError] = useState<CameraError | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false

    async function start() {
      const video = videoRef.current
      if (video === null) return

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` and not `exact`: a laptop has one camera and refusing to
          // open it because it is not the front one would be absurd.
          video: { facingMode: { ideal: facing } },
          audio: false,
        })
      } catch (cause) {
        if (stopped) return
        const name = cause instanceof DOMException ? cause.name : ''
        setError(
          name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'missing' : 'failed',
        )
        return
      }
      if (stopped) {
        for (const track of stream.getTracks()) track.stop()
        return
      }

      setError(null)
      video.srcObject = stream
      await video.play().catch(() => undefined)
    }

    void start()

    return () => {
      stopped = true
      if (stream !== null) for (const track of stream.getTracks()) track.stop()
    }
  }, [videoRef, facing])

  return error
}
