import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * La targeta blanca amb el codi i el nom.
 *
 * Fora de la pantalla del QR perquè ara també la pinta la porta de la sessió:
 * qui obre l'app amb la sessió caducada i sense cobertura no arriba a la
 * pantalla del QR, i és just qui més la necessita.
 *
 * White card on a dark app on purpose. Scanners read dark-on-light far more
 * reliably, and inverting a QR is the kind of clever that costs you a second
 * per person at the door.
 */

export const CARD = 340
const CODE = 300

export function QrCard({
  token,
  name,
  subtitle = '',
}: {
  readonly token: string
  readonly name: string
  readonly subtitle?: string
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawError, setDrawError] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    void QRCode.toCanvas(canvas, token, {
      width: CODE,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(
      () => {
        setDrawError(false)
      },
      () => {
        setDrawError(true)
      },
    )
  }, [token])

  return (
    <div className="flex flex-col items-center rounded-lg bg-white p-10" style={{ width: CARD }}>
      {drawError ? (
        <p
          role="alert"
          className="flex h-[300px] w-[300px] items-center justify-center text-center text-md text-[oklch(0.42_0.012_45)] [text-wrap:pretty]"
        >
          {t('qr.unavailable')}
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          width={CODE}
          height={CODE}
          aria-label={t('qr.codeLabel')}
          role="img"
        />
      )}

      {name === '' ? null : (
        <p className="display mt-9 text-center text-d-sm tracking-[-0.04em] text-[oklch(0.18_0.012_25)]">
          {name}
        </p>
      )}
      {subtitle === '' ? null : (
        <p className="mt-3 text-center text-md font-semibold text-[oklch(0.42_0.012_45)]">
          {subtitle}
        </p>
      )}
    </div>
  )
}
