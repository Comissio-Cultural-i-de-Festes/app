import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { APP_TIME_ZONE, formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { EventType } from '@/lib/model'
import { DbError } from '@/lib/db'
import { errorKey } from '@/lib/errors'
import type { EventRow } from '@/lib/schema'
import { uploadCover } from '@/lib/storage'
import { useCovers } from '@/ui/Cover/useCovers'

import { EventPreview, type PreviewData } from './EventPreview'
import { Field, INPUT } from './formBits'
import { JuntaHeader } from './JuntaHeader'
import {
  type EventDraft,
  eventFormKeys,
  deleteEvent,
  fetchMemberCount,
  fetchPointValues,
  fetchTemplates,
  fromLocalInput,
  saveEvent,
  setPublished,
  toLocalInput,
} from './eventFormApi'

/**
 * Creating an event, and editing one.
 *
 * Two ways out, on purpose. "Guarda i plega" keeps a draft nobody can see —
 * `published` stays false and the row is invisible to every member — because
 * an event gets written on a phone between two lectures and finished later.
 * The other button publishes.
 *
 * The scheduled reveal is the one thing here that needs showing rather than
 * describing, so the panel draws what a member will actually see until the
 * clock runs out.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const TYPES: readonly EventType[] = ['fiesta', 'casa_rural', 'actividad']

/**
 * Keyed on the id, which is not a detail.
 *
 * Everything below keeps per-event state that React Router would otherwise
 * carry from one event to the next, because the route matches either way and
 * the component is never unmounted. The worst of it is `edits`: go from one
 * event to another and the form would show the first one's values while
 * pointing at the second, and saving would write them onto it. The open
 * confirmations do the same thing more visibly and less expensively.
 */
export function EventFormScreen() {
  const { id } = useParams()
  return <EventForm key={id ?? 'nou'} />
}

function EventForm() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const navigate = useNavigate()
  const client = useQueryClient()
  const { id } = useParams()
  const editing = id !== undefined && id !== 'nou'

  const existing = useQuery({
    queryKey: eventKeys.one(id ?? ''),
    queryFn: () => fetchEvent(id ?? ''),
    enabled: editing,
  })
  const templates = useQuery({
    queryKey: eventFormKeys.templates(),
    queryFn: fetchTemplates,
    enabled: !editing,
  })
  const points = useQuery({
    queryKey: eventFormKeys.pointValues(),
    queryFn: fetchPointValues,
  })

  // The row is the starting point and the edits are the overlay, rather than
  // an effect that copies one into the other: an effect would have to be
  // careful not to fire again and overwrite what somebody is typing.
  const [previewing, setPreviewing] = useState(false)
  const [edits, setEdits] = useState<FormState | null>(null)
  const form = edits ?? (existing.data == null ? emptyForm() : formFrom(existing.data))
  const setForm = setEdits

  // Both halves of the picked cover travel together, and the object URL is
  // minted in the event handler that picked it — never during a render.
  const [cover, setCover] = useState<{ readonly file: File; readonly url: string } | null>(null)
  useEffect(() => () => {
    if (cover !== null) URL.revokeObjectURL(cover.url)
  })

  const covers = useCovers([form.cover_url])
  const coverPreview = cover?.url ?? covers.data?.get(form.cover_url ?? '') ?? null

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      let coverPath = form.cover_url
      if (cover !== null) {
        // Uploaded under the event's own id, so a new event has to exist
        // first. Saving twice is cheaper than inventing an id here and
        // orphaning the upload if the save then fails.
        const eventId = await saveEvent(draftFrom(form, publish, coverPath))
        coverPath = await uploadCover(cover.file, eventId)
        return saveEvent(
          draftFrom({ ...form, id: eventId, cover_url: coverPath }, publish, coverPath),
        )
      }
      return saveEvent(draftFrom(form, publish, coverPath))
    },
    onSuccess: async () => {
      await client.invalidateQueries()
      void navigate('/junta', { replace: true })
    },
  })

  const ready = form.titulo.trim() !== '' && form.starts_at !== ''
  const showTemplates = !editing && (templates.data?.length ?? 0) > 0
  // Without templates there is nothing above the fields, so they take both
  // rows rather than leaving a hole where the list would have been.
  const fieldsPlacement = showTemplates
    ? 'lg:col-start-1 lg:row-start-2'
    : 'lg:col-start-1 lg:row-start-1 lg:row-span-2'

  // Editing something the whole association can already see is a different
  // act from creating one. Offering "guarda i plega" here would let a tap
  // take a live event off everybody's home screen without saying so.
  const live = editing && existing.data?.published === true
  const defaultPoints =
    points.data?.find((v) => v.mena === 'tipus_esdeveniment' && v.clau === form.tipo)?.punts ?? null

  // An id in the address bar and no row to go with it is not an empty form.
  // Falling through to one left `id` null, so `admin_save_event` was sent no
  // p_id and CREATED A SECOND EVENT — the original untouched, the calendar now
  // holding two, and nothing on screen to say so.
  if (editing && existing.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-app">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }
  if (editing && (existing.isError || existing.data == null)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-app px-12">
        <p role="alert" className="text-center text-lg font-bold text-error [text-wrap:pretty]">
          {existing.isError ? t(errorKey(existing.error)) : t('errors.notFound')}
        </p>
        <button
          type="button"
          onClick={() => void existing.refetch()}
          className="min-h-[44px] px-4 text-md font-bold text-brand-label"
        >
          {t('actions.retry')}
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      {previewing ? (
        <EventPreview
          data={previewFrom(form, coverPreview)}
          locale={locale}
          onClose={() => {
            setPreviewing(false)
          }}
        />
      ) : null}

      <JuntaHeader
        to="/junta"
        className="lg:hidden"
        label={t('junta.form.leaveIt')}
        aside={
          <button
            type="button"
            onClick={() => {
              setPreviewing(true)
            }}
            className="-mr-2 min-h-[44px] flex-none px-2 text-md font-bold text-brand-label"
          >
            {t('junta.form.preview')}
          </button>
        }
        title={editing ? t('junta.form.editTitle') : t('junta.form.newTitle')}
      />

      <div className="hidden items-center border-b border-surface-5 px-14 py-7 lg:flex">
        <h1 className="display text-d-s leading-none tracking-[-0.045em] [text-wrap:balance]">
          {editing
            ? form.titulo === ''
              ? t('junta.form.editTitle')
              : form.titulo
            : t('junta.form.newTitle')}
        </h1>
      </div>

      {editing && existing.data !== null && existing.data !== undefined ? (
        <PublishedStrip eventId={existing.data.id} published={existing.data.published} />
      ) : null}

      <div className="lg:grid lg:grid-cols-[1fr_372px] lg:items-start lg:gap-15 lg:px-14 lg:pb-16">
        {showTemplates ? (
          <section className={`pt-8 lg:col-start-1 lg:row-start-1 ${GUTTER}`}>
            <h2 className="eyebrow text-fg-muted">{t('junta.form.templates')}</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {templates.data?.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(templateFrom(e))
                    }}
                    className="flex min-h-[56px] w-full items-center gap-4 border-[1.5px] border-surface-7 bg-surface-1 px-8 py-6 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{e.titulo}</span>
                      <span className="mt-[3px] block text-[12.5px] text-[var(--ds-text-muted-lo)]">
                        {formatDateTime(new Date(e.starts_at), locale)}
                      </span>
                    </span>
                    <span className="flex-none text-md font-bold text-brand-label">
                      {t('junta.form.copyIt')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={`pt-9 lg:col-start-2 lg:row-start-1 ${GUTTER}`}>
          <CoverPicker
            preview={coverPreview}
            onPick={(f) => {
              if (cover !== null) URL.revokeObjectURL(cover.url)
              setCover({ file: f, url: URL.createObjectURL(f) })
            }}
          />
        </section>

        <section className={`pt-9 ${fieldsPlacement} ${GUTTER}`}>
          <Field label={t('junta.form.name')}>
            <input
              value={form.titulo}
              onChange={(e) => {
                setForm({ ...form, titulo: e.target.value })
              }}
              placeholder={t('junta.form.namePlaceholder')}
              className={INPUT}
            />
          </Field>

          <Field label={t('junta.form.what')}>
            <div className="flex gap-4">
              {TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={form.tipo === type}
                  onClick={() => {
                    setForm({ ...form, tipo: type })
                  }}
                  className={
                    'flex min-h-[48px] flex-1 items-center justify-center px-2 text-md font-bold [text-wrap:balance] ' +
                    (form.tipo === type
                      ? 'bg-brand-cta text-on-brand'
                      : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                  }
                >
                  {t(`eventType.${type}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('junta.form.starts')}>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => {
                setForm({ ...form, starts_at: e.target.value })
              }}
              className={INPUT}
            />
          </Field>

          <Field label={t('junta.form.ends')}>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => {
                setForm({ ...form, ends_at: e.target.value })
              }}
              className={INPUT}
            />
          </Field>

          <Field label={t('junta.form.where')}>
            <input
              value={form.ubicacion}
              onChange={(e) => {
                setForm({ ...form, ubicacion: e.target.value })
              }}
              placeholder={t('junta.form.wherePlaceholder')}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label={t('junta.form.places')}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={form.plazas}
                onChange={(e) => {
                  setForm({ ...form, plazas: e.target.value })
                }}
                placeholder={t('junta.form.noLimit')}
                className={INPUT}
              />
            </Field>
            <Field label={t('junta.form.price')}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={form.preu}
                onChange={(e) => {
                  setForm({ ...form, preu: e.target.value })
                }}
                placeholder="0"
                className={INPUT}
              />
            </Field>
            <Field label={t('junta.form.points')}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.puntos}
                onChange={(e) => {
                  setForm({ ...form, puntos: e.target.value })
                }}
                placeholder={defaultPoints === null ? '' : String(defaultPoints)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label={t('junta.form.description')}>
            <textarea
              value={form.descripcion}
              onChange={(e) => {
                setForm({ ...form, descripcion: e.target.value })
              }}
              rows={4}
              placeholder={t('junta.form.descriptionPlaceholder')}
              className={`${INPUT} resize-y`}
            />
          </Field>

          <Field label={t('junta.form.transport')} hint={t('junta.form.transportHint')}>
            <textarea
              value={form.transport_info}
              onChange={(e) => {
                setForm({ ...form, transport_info: e.target.value })
              }}
              rows={3}
              placeholder={t('junta.form.transportPlaceholder')}
              className={`${INPUT} resize-y`}
            />
          </Field>
        </section>

        <div className="lg:col-start-2 lg:row-start-2">
          <RevealBlock
            form={form}
            locale={locale}
            onChange={(next) => {
              setForm(next)
            }}
          />

          <section className={`pt-12 ${GUTTER}`}>
            <button
              type="button"
              disabled={!ready || save.isPending}
              onClick={() => {
                save.mutate(true)
              }}
              className={
                'flex min-h-[60px] w-full items-center justify-center px-8 py-4 text-2xl font-bold [text-wrap:balance] ' +
                (ready
                  ? 'bg-brand-cta text-on-brand shadow-brand'
                  : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-muted')
              }
            >
              {save.isPending
                ? t('state.updating')
                : live
                  ? t('junta.form.saveChanges')
                  : t('junta.form.publish')}
            </button>
            <p className="mt-4 text-center text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
              {form.reveal_at !== ''
                ? t('junta.form.publishHidden')
                : live
                  ? t('junta.form.saveChangesNote')
                  : t('junta.form.publishNow')}
            </p>

            {live ? null : (
              <button
                type="button"
                disabled={!ready || save.isPending}
                onClick={() => {
                  save.mutate(false)
                }}
                className="mt-8 min-h-[48px] w-full cursor-pointer border-0 bg-transparent text-center text-md font-bold text-fg-muted disabled:opacity-70"
              >
                {t('junta.form.saveDraft')}
              </button>
            )}

            {save.isError ? (
              <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
                {t('errors.generic')}
              </p>
            ) : null}

            {editing ? <DeleteEvent eventId={id ?? ''} /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}

// ── the form's own shape, all strings, because inputs hold strings ──────────

interface FormState {
  id: string | null
  titulo: string
  tipo: EventType
  starts_at: string
  ends_at: string
  ubicacion: string
  plazas: string
  preu: string
  puntos: string
  teaser: string
  reveal_at: string
  descripcion: string
  transport_info: string
  cover_url: string | null
}

function emptyForm(): FormState {
  return {
    id: null,
    titulo: '',
    tipo: 'fiesta',
    starts_at: '',
    ends_at: '',
    ubicacion: '',
    plazas: '',
    preu: '',
    puntos: '',
    teaser: '',
    reveal_at: '',
    descripcion: '',
    transport_info: '',
    cover_url: null,
  }
}

function formFrom(e: EventRow): FormState {
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo as EventType,
    starts_at: toLocalInput(e.starts_at, APP_TIME_ZONE),
    ends_at: toLocalInput(e.ends_at, APP_TIME_ZONE),
    ubicacion: e.ubicacion ?? '',
    plazas: e.plazas === null ? '' : String(e.plazas),
    preu: e.precio_cents === 0 ? '' : String(e.precio_cents / 100),
    puntos: String(e.puntos),
    teaser: e.teaser ?? '',
    reveal_at: toLocalInput(e.reveal_at, APP_TIME_ZONE),
    descripcion: e.descripcion ?? '',
    transport_info: e.transport_info ?? '',
    cover_url: e.cover_url,
  }
}

/**
 * A past event as a starting point.
 *
 * Everything about the shape of the evening carries over; nothing that ties it
 * to a date does. Copying the start time would produce an event in the past,
 * and copying the cover would put last year's photo on this year's poster.
 */
function templateFrom(e: EventRow): FormState {
  return {
    ...formFrom(e),
    id: null,
    starts_at: '',
    ends_at: '',
    reveal_at: '',
    cover_url: null,
  }
}

function draftFrom(form: FormState, published: boolean, coverPath: string | null): EventDraft {
  const price = Number.parseFloat(form.preu)
  const places = Number.parseInt(form.plazas, 10)
  const pts = Number.parseInt(form.puntos, 10)

  return {
    id: form.id,
    titulo: form.titulo.trim(),
    tipo: form.tipo,
    starts_at: fromLocalInput(form.starts_at, APP_TIME_ZONE) ?? new Date().toISOString(),
    ends_at: fromLocalInput(form.ends_at, APP_TIME_ZONE),
    plazas: Number.isFinite(places) && places > 0 ? places : null,
    precio_cents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0,
    puntos: Number.isFinite(pts) ? pts : null,
    teaser: blankToNull(form.teaser),
    reveal_at: fromLocalInput(form.reveal_at, APP_TIME_ZONE),
    published,
    descripcion: blankToNull(form.descripcion),
    ubicacion: blankToNull(form.ubicacion),
    cover_url: coverPath,
    transport_info: blankToNull(form.transport_info),
  }
}

/**
 * The form's strings as the member's screen wants them.
 *
 * Deliberately separate from `draftFrom`: that one is the RPC payload and
 * clamps and defaults things on the way to the database, while this one has to
 * show exactly what has been typed, including a start time that is still half
 * entered. A date that will not parse becomes null and the preview simply
 * leaves that line out.
 */
function previewFrom(form: FormState, coverUrl: string | null): PreviewData {
  const starts = fromLocalInput(form.starts_at, APP_TIME_ZONE)
  const ends = fromLocalInput(form.ends_at, APP_TIME_ZONE)
  const reveal = fromLocalInput(form.reveal_at, APP_TIME_ZONE)
  const price = Number.parseFloat(form.preu)
  const places = Number.parseInt(form.plazas, 10)

  return {
    titulo: form.titulo,
    teaser: form.teaser,
    startsAt: starts === null ? null : new Date(starts),
    endsAt: ends === null ? null : new Date(ends),
    ubicacion: form.ubicacion,
    plazas: Number.isFinite(places) && places > 0 ? places : null,
    precioCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0,
    coverUrl,
    transport: form.transport_info,
    descripcion: form.descripcion,
    hidden: reveal !== null && Date.parse(reveal) > Date.now(),
  }
}

function blankToNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim()
}

/**
 * Getting rid of one that should not exist.
 *
 * At the very bottom, past everything else, and it asks. The database refuses
 * an event with points on it whatever this button does — deleting one of those
 * keeps the points and loses what they were for — so the interesting job here
 * is saying that clearly rather than reporting a failure.
 */
function DeleteEvent({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: () => {
      void navigate('/junta', { replace: true })
    },
  })

  // P0001 is the "it has points" refusal. Anything else is an ordinary
  // failure, and telling somebody to unpublish would be the wrong advice.
  const hasPoints = remove.error instanceof DbError && remove.error.code === 'P0001'

  return (
    <div className="mt-14 border-t border-surface-5 pt-9">
      {asking ? (
        <>
          <p className="text-md font-bold [text-wrap:pretty]">{t('junta.form.deleteAsk')}</p>
          <div className="mt-6 flex gap-4">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate()
              }}
              className="min-h-[48px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-6 text-md font-bold text-[var(--ds-warning)] disabled:opacity-70"
            >
              {t('junta.form.deleteConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false)
              }}
              className="min-h-[48px] flex-1 border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAsking(true)
          }}
          className="min-h-[48px] w-full text-center text-md font-bold text-[var(--ds-warning)]"
        >
          {t('junta.form.delete')}
        </button>
      )}

      {remove.isError ? (
        <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
          {hasPoints ? t('junta.form.deleteHasPoints') : t(errorKey(remove.error))}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Live or not, at the top of the form, with the switch in it.
 *
 * Above everything else and outside the scrolling columns on a laptop,
 * because the whole point is that you cannot edit an event for two minutes
 * without knowing whether people are looking at it.
 */
function PublishedStrip({
  eventId,
  published,
}: {
  readonly eventId: string
  readonly published: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const members = useQuery({
    queryKey: eventFormKeys.memberCount(),
    queryFn: fetchMemberCount,
    enabled: published,
  })

  const flip = useMutation({
    mutationFn: (next: boolean) => setPublished(eventId, next),
    onSuccess: async () => {
      setConfirming(false)
      await client.invalidateQueries()
    },
  })

  const tone = published
    ? 'bg-[var(--ds-bg-live)] border-b-2 border-success'
    : 'bg-surface-2 border-b-2 border-dashed border-[var(--ds-border-input)]'

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={published}
        disabled={flip.isPending}
        onClick={() => {
          // One way is a decision you undo with another tap; the other takes
          // the thing off two hundred phones. Only one of them asks.
          if (published) setConfirming((was) => !was)
          else flip.mutate(true)
        }}
        className={`flex min-h-[76px] w-full items-center gap-7 px-[var(--ds-gutter)] py-8 text-left ${tone}`}
      >
        <span
          aria-hidden="true"
          className={
            'flex size-[44px] flex-none items-center justify-center rounded-full text-xl font-extrabold ' +
            (published ? 'bg-success text-[var(--ds-on-state)]' : 'bg-surface-7 text-fg-muted')
          }
        >
          {published ? '◉' : '◌'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block text-[22px] leading-none tracking-[-0.04em]">
            {published ? t('junta.form.live') : t('junta.form.draft')}
          </span>
          <span className="mt-[5px] block text-sm font-semibold [text-wrap:pretty]">
            {published
              ? members.data === undefined
                ? t('junta.form.liveSubPlain')
                : t('junta.form.liveSub', { count: members.data })
              : t('junta.form.draftSub')}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={
            'flex h-[28px] w-[48px] flex-none items-center rounded-full p-[3px] ' +
            (published ? 'bg-success' : 'bg-surface-6')
          }
        >
          <span
            className={
              'size-[22px] rounded-full bg-fg transition-transform ' +
              (published ? 'translate-x-[20px]' : '')
            }
          />
        </span>
      </button>

      {confirming ? (
        <div className={`border-b border-surface-5 bg-surface-1 py-8 ${GUTTER}`}>
          <p className="text-md font-bold [text-wrap:pretty]">{t('junta.form.unpublishAsk')}</p>
          <div className="mt-6 flex gap-4">
            <button
              type="button"
              disabled={flip.isPending}
              onClick={() => {
                flip.mutate(false)
              }}
              className="min-h-[48px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-6 text-md font-bold text-[var(--ds-warning)] disabled:opacity-70"
            >
              {t('junta.form.unpublish')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
              }}
              className="min-h-[48px] flex-1 border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {flip.isError ? (
        <p role="alert" className={`py-6 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(flip.error))}
        </p>
      ) : null}
    </div>
  )
}

// ── pieces ──────────────────────────────────────────────────────────────────

function CoverPicker({
  preview,
  onPick,
}: {
  readonly preview: string | null
  readonly onPick: (f: File) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const shown = preview

  return (
    <div>
      <label
        htmlFor={id}
        className="relative flex h-[180px] cursor-pointer items-center justify-center overflow-hidden border-[1.5px] border-dashed border-[var(--ds-border-input)] bg-surface-1"
      >
        {shown === null ? (
          <span className="px-8 text-center text-md text-fg-muted [text-wrap:pretty]">
            {t('junta.form.coverEmpty')}
          </span>
        ) : (
          <img src={shown} alt="" className="size-full object-cover" />
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onPick(picked)
        }}
      />
      <p className="mt-4 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.form.coverHint')}
      </p>
    </div>
  )
}

function RevealBlock({
  form,
  locale,
  onChange,
}: {
  readonly form: FormState
  readonly locale: ReturnType<typeof toLocale>
  readonly onChange: (next: FormState) => void
}) {
  const { t } = useTranslation()
  const on = form.reveal_at !== ''
  const when = fromLocalInput(form.reveal_at, APP_TIME_ZONE)
  const left = when === null ? null : timeLeft(when, t)

  return (
    <section className={`border-y border-surface-7 py-9 ${GUTTER}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => {
          onChange({
            ...form,
            reveal_at: on
              ? ''
              : toLocalInput(new Date(Date.now() + 86_400_000).toISOString(), APP_TIME_ZONE),
          })
        }}
        className="flex min-h-[56px] w-full items-center gap-4 py-[15px] text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{t('junta.form.reveal')}</span>
          <span className="mt-[3px] block text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('junta.form.revealSub')}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={
            'flex h-[28px] w-[48px] flex-none items-center rounded-full p-[3px] ' +
            (on ? 'bg-brand' : 'bg-surface-6')
          }
        >
          <span
            className={
              'size-[22px] rounded-full bg-on-brand transition-transform ' +
              (on ? 'translate-x-[20px]' : '')
            }
          />
        </span>
      </button>

      {on ? (
        <div className="pt-9">
          <Field label={t('junta.form.revealAt')}>
            <input
              type="datetime-local"
              value={form.reveal_at}
              onChange={(e) => {
                onChange({ ...form, reveal_at: e.target.value })
              }}
              className={INPUT}
            />
          </Field>

          {/* Half the promise of a scheduled reveal is the countdown the
              member sees, so the person setting it should see the same number
              rather than working it out from two dates. */}
          {left === null ? null : (
            <p className="-mt-5 pb-9 text-sm font-bold text-[var(--ds-unknown)]">
              {t('junta.form.countdown')} <span className="tabular">{left}</span>
            </p>
          )}

          <Field label={t('junta.form.teaser')} hint={t('junta.form.teaserHint')}>
            <input
              value={form.teaser}
              onChange={(e) => {
                onChange({ ...form, teaser: e.target.value })
              }}
              placeholder={t('junta.form.teaserPlaceholder')}
              className={INPUT}
            />
          </Field>

          {/* Drawn rather than described: this is what a member sees until the
              clock runs out, and it is the one part of the form whose effect
              is invisible from the form itself. */}
          <div className="border border-surface-7 bg-surface-1 p-8">
            <p className="eyebrow-sm text-[var(--ds-warning-deep)]">
              {t('junta.form.stillHidden')}
            </p>
            <p className="display mt-4 text-d-sm leading-[0.9] tracking-[-0.05em] [text-wrap:balance]">
              {form.titulo.trim() === '' ? t('junta.form.previewTitle') : form.titulo}
            </p>
            <p className="mt-4 text-md text-fg-secondary [text-wrap:pretty]">
              {form.teaser.trim() === '' ? t('junta.form.previewTeaser') : form.teaser}
            </p>
            <p className="mt-6 text-sm font-bold text-fg-muted">
              {when === null
                ? t('junta.form.previewNoDate')
                : t('junta.form.previewOpens', {
                    when: formatDateTime(new Date(when), locale),
                  })}
            </p>
            <p className="mt-4 text-[12.5px] text-[var(--ds-text-muted-lo)]">
              {t('junta.form.previewHiddenFields')}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * "6 d 4 h", and nothing longer.
 *
 * Two units is all anybody reads off a countdown, and the second one stops
 * mattering once the first is in weeks. Returns null once the moment has gone
 * — a negative countdown is a bug pretending to be information.
 */
function timeLeft(iso: string, t: Translate): string | null {
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return null

  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return t('junta.form.leftDaysHours', { days, hours: hours % 24 })
  if (hours > 0) return t('junta.form.leftHoursMinutes', { hours, minutes: minutes % 60 })
  return t('junta.form.leftMinutes', { minutes })
}
