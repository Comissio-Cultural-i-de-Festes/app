import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Proposal, decide, fetchProposals, proposalKeys } from '@/features/proposals/api'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'
import { INPUT } from './formBits'
import { horizonIso } from '@/features/home/api'
import { JuntaHeader } from './JuntaHeader'

/**
 * The same list everybody sees, with two more buttons.
 *
 * Turning something down opens a panel that will not close until there is a
 * reason in it, because the reason is the only thing the person receives — and
 * it is the difference between somebody proposing another one and never
 * proposing again. The RPC refuses an empty one too; this is the half that
 * means nobody has to find out.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function IdeasReviewScreen() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [open, setOpen] = useState<{ id: string; accepta: boolean } | null>(null)
  const [nota, setNota] = useState('')
  const [event, setEvent] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const list = useQuery({ queryKey: proposalKeys.list(), queryFn: fetchProposals })
  const events = useQuery({
    queryKey: juntaEventKeys.list(horizonIso()),
    queryFn: () => fetchJuntaEvents(horizonIso()),
  })

  const send = useMutation({
    mutationFn: (v: { readonly id: string; readonly accepta: boolean }) =>
      decide(v.id, v.accepta, nota, v.accepta ? event : null),
    onSuccess: async (result) => {
      setNote(result === 'ja_decidida' ? t('ideas.alreadyDecided') : null)
      setOpen(null)
      setNota('')
      setEvent('')
      await client.invalidateQueries({ queryKey: proposalKeys.list() })
    },
  })

  const rows = (list.data ?? []).filter((p) => p.estat === 'oberta')

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader to="/junta" label={t('junta.back')} title={t('ideas.juntaTitle')} />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="text-md text-fg-secondary [text-wrap:pretty]">{t('ideas.juntaLede')}</p>
        <p className="mt-3 text-sm text-[var(--ds-text-muted-lo)]">
          {t('ideas.juntaOpen', { count: rows.length })}
        </p>
        {note === null ? null : (
          <p role="status" className="pt-6 text-md font-bold text-[var(--ds-warning)]">
            {note}
          </p>
        )}
        {send.isError ? (
          <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(send.error))}
          </p>
        ) : null}
      </div>

      {list.isPending ? (
        <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : list.isError ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(list.error))}
        </p>
      ) : (
        <ul className="mt-8">
          {rows.map((p) => (
            <li key={p.id} className="border-t border-surface-4">
              <Row proposal={p} />

              {open?.id === p.id ? (
                <Panel
                  accepta={open.accepta}
                  nota={nota}
                  event={event}
                  events={events.data ?? []}
                  busy={send.isPending}
                  onNota={setNota}
                  onEvent={setEvent}
                  onCancel={() => {
                    setOpen(null)
                    setNota('')
                  }}
                  onSend={() => {
                    send.mutate({ id: p.id, accepta: open.accepta })
                  }}
                />
              ) : (
                <div className={`flex flex-wrap gap-4 pb-7 ${GUTTER}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setNote(null)
                      setNota('')
                      setOpen({ id: p.id, accepta: true })
                    }}
                    className="min-h-[46px] flex-1 bg-brand-cta px-5 text-md font-bold text-on-brand [text-wrap:balance]"
                  >
                    {t('ideas.accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNote(null)
                      setNota('')
                      setOpen({ id: p.id, accepta: false })
                    }}
                    className="min-h-[46px] flex-none border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg-secondary"
                  >
                    {t('ideas.discard')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function Row({ proposal }: { readonly proposal: Proposal }) {
  return (
    <div className={`flex items-start gap-6 pt-6 pb-5 ${GUTTER}`}>
      <span className="display tabular w-[44px] flex-none text-center text-d-sm leading-[0.88] tracking-[-0.05em] text-brand-label">
        {proposal.vots}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold [text-wrap:pretty]">{proposal.titol}</span>
        <span className="mt-2 flex items-center gap-3">
          <Avatar src={proposal.autor?.avatar_url ?? null} size={20} />
          <span className="min-w-0 truncate text-[12.5px] text-[var(--ds-text-muted-lo)]">
            {proposal.autor?.nombre ?? ''}
          </span>
        </span>
        {proposal.descripcio === null ? null : (
          <span className="mt-3 block text-[12.5px] text-fg-muted [text-wrap:pretty]">
            {proposal.descripcio}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * The reason, and where it goes.
 *
 * Turning down: the note is required and the button stays off without it.
 * Accepting: an event has to be picked, because "accepted" without one is a
 * word and not a date. A note is optional there — a "why yes" is nice and not
 * load-bearing.
 */
function Panel({
  accepta,
  nota,
  event,
  events,
  busy,
  onNota,
  onEvent,
  onCancel,
  onSend,
}: {
  readonly accepta: boolean
  readonly nota: string
  readonly event: string
  readonly events: readonly { readonly id: string; readonly titulo: string }[]
  readonly busy: boolean
  readonly onNota: (v: string) => void
  readonly onEvent: (v: string) => void
  readonly onCancel: () => void
  readonly onSend: () => void
}) {
  const { t } = useTranslation()
  const ready = accepta ? event !== '' : nota.trim() !== ''

  return (
    <div className={`border-l-[3px] border-brand bg-surface-1 pt-6 pb-7 ${GUTTER}`}>
      {accepta ? (
        <>
          <label className="eyebrow block text-fg-muted" htmlFor="idea-event">
            {t('ideas.pickEvent')}
          </label>
          {events.length === 0 ? (
            <p className="mt-4 text-md text-[var(--ds-warning)] [text-wrap:pretty]">
              {t('ideas.noEvents')}
            </p>
          ) : (
            <select
              id="idea-event"
              value={event}
              onChange={(e) => {
                onEvent(e.target.value)
              }}
              className={INPUT}
            >
              <option value="">—</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <p className="eyebrow text-fg-muted">{t('ideas.whyNot')}</p>
      )}

      <textarea
        value={nota}
        onChange={(e) => {
          onNota(e.target.value)
        }}
        rows={3}
        maxLength={500}
        placeholder={accepta ? t('ideas.whyYes') : t('ideas.whyNotPlaceholder')}
        className={`${INPUT} resize-y`}
      />

      {/* Said before the button, not after. Somebody about to turn an idea
          down should know the sentence they are writing is the whole of what
          the other person gets. */}
      {accepta ? null : (
        <p className="mt-4 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('ideas.whyNotNote')}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={onSend}
          className={
            'min-h-[46px] flex-1 px-5 text-md font-bold [text-wrap:balance] disabled:opacity-50 ' +
            (accepta
              ? 'bg-brand-cta text-on-brand'
              : 'border-[1.5px] border-[var(--ds-warning)] text-[var(--ds-warning)]')
          }
        >
          {busy ? t('state.updating') : accepta ? t('ideas.accept') : t('ideas.discard')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[46px] flex-none px-5 text-md font-bold text-fg-muted"
        >
          {t('actions.cancel')}
        </button>
      </div>
    </div>
  )
}
