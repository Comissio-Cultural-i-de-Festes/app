import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { type AuditRow, PAGE, auditKeys, fetchAudit } from './auditApi'
import { JuntaHeader } from './JuntaHeader'

/**
 * What the association has done, in order.
 *
 * Every row gets a sentence, and every row also gets its exact record on
 * demand. Both halves are needed and for different people: the sentence is for
 * the junta working out who published something last September, and the raw
 * detail is for the day somebody asks what is held about them and the honest
 * answer is the actual stored object rather than a paraphrase of it.
 *
 * An action with no sentence yet still renders — with its name and its detail
 * — because a log that silently drops what it does not recognise is a log that
 * cannot be trusted about anything.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function AuditScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const [pages, setPages] = useState(1)

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.audit.title')}
        className="lg:hidden"
      />

      <p className={`pt-8 pb-2 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.audit.lede')}
      </p>

      {Array.from({ length: pages }, (_, index) => (
        <Page
          key={index}
          index={index}
          locale={locale}
          last={index === pages - 1}
          onMore={() => {
            setPages(pages + 1)
          }}
        />
      ))}
    </main>
  )
}

/**
 * One page, holding its own query.
 *
 * Kept as separate mounted queries rather than one growing list because that
 * is what makes a page already read stay read: nothing refetches the whole
 * history to show forty more rows.
 */
function Page({
  index,
  locale,
  last,
  onMore,
}: {
  readonly index: number
  readonly locale: ReturnType<typeof toLocale>
  readonly last: boolean
  readonly onMore: () => void
}) {
  const { t } = useTranslation()
  const rows = useQuery({ queryKey: auditKeys.page(index), queryFn: () => fetchAudit(index) })

  if (rows.isPending) {
    return <AuditSkeleton />
  }
  if (rows.isError) {
    return (
      <p role="alert" className={`pt-8 text-md font-bold text-error ${GUTTER}`}>
        {t(errorKey(rows.error))}
      </p>
    )
  }
  if (rows.data.length === 0) {
    return (
      <p className={`pt-8 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
        {index === 0 ? t('junta.audit.empty') : t('junta.audit.end')}
      </p>
    )
  }

  return (
    <>
      <ul>
        {rows.data.map((row) => (
          <Entry key={row.id} row={row} locale={locale} />
        ))}
      </ul>

      {last && rows.data.length === PAGE ? (
        <div className={`pt-8 ${GUTTER}`}>
          <button
            type="button"
            onClick={onMore}
            className="min-h-[50px] w-full border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary"
          >
            {t('junta.audit.more')}
          </button>
        </div>
      ) : null}
    </>
  )
}

function Entry({
  row,
  locale,
}: {
  readonly row: AuditRow
  readonly locale: ReturnType<typeof toLocale>
}) {
  const { t } = useTranslation()

  // `actor_id` is ON DELETE SET NULL, so an entry outlives the account that
  // made it. Saying so is better than a blank where a name goes.
  const actor = row.profiles?.nombre ?? t('junta.audit.unknown')
  const sentence = t(`junta.audit.accio.${row.accio}`, {
    actor,
    defaultValue: t('junta.audit.other', { actor, accio: row.accio }),
  })

  return (
    <li className={`border-b border-surface-4 py-6 ${GUTTER}`}>
      <p className="eyebrow text-[var(--ds-text-muted-lo)]">
        {formatDateTime(new Date(row.created_at), locale)}
      </p>
      <p className="mt-2 text-md font-bold [text-wrap:pretty]">{sentence}</p>

      {row.detall == null ? null : (
        <details className="mt-3">
          <summary className="min-h-[32px] cursor-pointer text-sm font-bold text-fg-muted">
            {t('junta.audit.detail')}
          </summary>
          {/* The stored object, not a rendering of it. This is the half that
              answers "what exactly do you have about me". */}
          <pre className="mt-3 overflow-x-auto bg-surface-1 p-5 text-[12px] leading-relaxed text-fg-secondary">
            {JSON.stringify(row.detall, null, 2)}
          </pre>
        </details>
      )}
    </li>
  )
}

/** La data en petit i la frase a sota, sis vegades: el registre és això. */
function AuditSkeleton() {
  return (
    <Skeleton>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`border-b border-surface-4 py-6 ${GUTTER}`}>
          <SkeletonBar w="w-[42%]" h="h-[10px]" />
          <SkeletonBar w="w-[85%]" h="h-[14px]" className="mt-2" />
        </div>
      ))}
    </Skeleton>
  )
}
