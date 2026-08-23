import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * The rear camera, and a QR read out of it.
 *
 * `BarcodeDetector` is native on Android Chrome and absent on every iPhone, so
 * the ponyfill is imported unconditionally: it uses the native implementation
 * when there is one and a wasm decoder when there is not. Importing it lazily
 * keeps a decoder out of the bundle everybody else downloads.
 *
 * The loop runs on requestAnimationFrame rather than a timer. A timer keeps
 * firing while the phone is in a pocket with the screen off, and running the
 * detector is the most expensive thing this app does.
 *
 * The element's ref is passed in rather than handed back, so what this hook
 * returns is state and nothing else. A hook that returns a ref alongside state
 * makes every read of that object a ref read as far as the compiler can tell.
 */

export type CameraError = 'denied' | 'missing' | 'failed'

export function useCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  onCode: (value: string) => void,
): CameraError | null {
  const [error, setError] = useState<CameraError | null>(null)

  // The callback changes on every render of the screen above. Kept in a ref so
  // the camera is not torn down and restarted each time, which on a phone is a
  // visible black flash and half a second of not scanning.
  const latest = useRef(onCode)
  useEffect(() => {
    latest.current = onCode
  }, [onCode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false

    async function start() {
      const video = videoRef.current
      if (video === null) return

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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

      video.srcObject = stream
      await video.play().catch(() => undefined)

      const { BarcodeDetector } = await import('barcode-detector/ponyfill')
      const detector = new BarcodeDetector({ formats: ['qr_code'] })

      let busy = false
      const tick = () => {
        frame = requestAnimationFrame(tick)
        if (busy || video.readyState < 2) return
        busy = true
        void detector
          .detect(video)
          .then((codes) => {
            const first = codes[0]
            if (first !== undefined && first.rawValue !== '') latest.current(first.rawValue)
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false
          })
      }
      frame = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      if (stream !== null) for (const track of stream.getTracks()) track.stop()
    }
  }, [videoRef])

  return error
}
