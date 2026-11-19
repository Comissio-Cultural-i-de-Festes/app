import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { eventTitle } from '@/features/event/title'
import { useUserId } from '@/features/session/useUserId'
import { formatTime, formatWeekdayLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'

import { portesRecordades } from './portesRecordades'

/**
 * L'escàner de les portes desades, quan no se'n sap res de més nou.
 *
 * Surt on el rebedor no pot dir quina és la porta: a la pantalla que diu que
 * no hi ha xarxa abans d'entrar a la junta, i a la porta mateixa quan carrega
 * o falla sense cap altra pista. Per què es desen i què se'n desa és a
 * `portesRecordades.ts`.
 *
 * DIU QUE SÓN DESADES, i de quan. Sense la línia, la llista sembla la porta
 * d'ara, i el que sap aquest mòbil és el que sabia l'última vegada que va tenir
 * xarxa.
 *
 * Es llegeix un cop en muntar-se: és la pantalla de quan no hi ha xarxa, i
 * quan torna la porta de debò la substitueix.
 */
export function PortesRecordadesBlock({ className = '' }: { readonly className?: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()
  const [recordades] = useState(() => portesRecordades(userId))

  if (recordades === null) return null

  return (
    <section className={`w-full ${className}`}>
      <p className="eyebrow text-fg-muted">
        {t('junta.home.recordades.title', {
          hora: formatTime(new Date(recordades.desat), locale),
          dia: formatWeekdayLong(new Date(recordades.desat), locale),
        })}
      </p>
      <p className="mt-3 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.home.recordades.note')}
      </p>
      <ul className="mt-6 flex flex-col gap-7">
        {recordades.portes.map((p) => (
          <li key={p.id}>
            <p className="text-lg font-bold [text-wrap:balance]">{eventTitle(p.titulo)}</p>
            <div className="mt-4 grid grid-cols-2 gap-5">
              <Link
                to={`/junta/escaner/${p.id}`}
                className="flex min-h-[56px] items-center justify-center bg-brand-cta px-6 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
              >
                {t('junta.scan')}
              </Link>
              <Link
                to={`/junta/alta/${p.id}`}
                className="flex min-h-[56px] items-center justify-center border-[1.5px] border-surface-7 px-6 text-lg font-bold text-fg no-underline [text-wrap:balance]"
              >
                {t('junta.form.eines.alta.title')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
