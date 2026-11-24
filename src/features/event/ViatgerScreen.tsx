import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { fetchSummaries, homeKeys } from '@/features/home/api'
import { dayStartIso, summaryOf } from '@/features/home/summary'
import { toDateInput } from '@/features/junta/configApi'
import { Field, INPUT } from '@/features/junta/formBits'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useUserId } from '@/features/session/useUserId'
import { APP_TIME_ZONE, formatDateLong } from '@/i18n/format'
import { INTL_LOCALE, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { useOnline } from '@/lib/useOnline'
import { Button } from '@/ui/Button/Button'
import { Confirm } from '@/ui/Confirm/Confirm'
import { Notice } from '@/ui/Notice/Notice'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { eventKeys, fetchEvent } from './api'
import { paisosOrdenats } from './paisos'
import { eventTitle } from './title'
import {
  BUIT,
  type CampViatger,
  type EsborranyViatger,
  MAX_ADRECA,
  MAX_LOCALITAT,
  MAX_NOM,
  SEXES,
  TIPUS_DOCUMENT,
  esApuntat,
  esborranyDe,
  esborrenEl,
  llegeixViatger,
  portaSuport,
} from './viatger'
import {
  desaMevesDades,
  esborraMevesDades,
  fetchDemanaViatger,
  fetchMevesDades,
  viatgerKeys,
} from './viatgerApi'

/**
 * Les dades del registre de viatgers, per omplir o revisar.
 *
 * EL TEXT DE DALT NO ÉS LLETRA PETITA. Diu per a què són, qui les veu i quin
 * dia s'esborren, amb la data, abans del primer camp: és el que algú vol saber
 * abans d'escriure el número del DNI en una app, i posar-ho al final o darrere
 * d'un enllaç seria demanar-li confiança a cegues.
 *
 * VALIDACIÓ AMABLE. Cap camp es posa en ambre mentre s'escriu: un camp es
 * revisa quan se'n surt, i tots quan es prem «Desa». La frase de cada camp diu
 * què hi falta, no «invàlid», i el camp hi apunta amb `aria-describedby`.
 *
 * SENSE XARXA NO S'ENVIA, I ES DIU. Són dades personals i no van a cap cua: ni
 * IndexedDB ni cap mutació en pausa que surti sola quan torni la cobertura,
 * potser quan la persona ja ha tancat la pantalla pensant que no s'havia desat.
 * Per això `networkMode: 'always'`, al revés que a la resta de formularis
 * d'aquesta app: la crida surt, falla, i la frase és la de «sense connexió». El
 * que hi ha escrit es queda al formulari.
 *
 * L'AUTOCOMPLETAT, NOMÉS ON ÉS DE LA PERSONA. Nom, cognom, sexe, data de
 * naixement i adreça són seus i el navegador els pot posar. El telèfon
 * d'emergència NO: és el d'algú altre, i `autocomplete="tel"` hi posaria el
 * seu, que és exactament el número que no serveix si li passa alguna cosa.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const BAD = 'border-warning'

export function ViatgerScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { id = '' } = useParams()
  const userId = useUserId()
  const navigate = useNavigate()
  const client = useQueryClient()
  const online = useOnline()
  const [now] = useState(() => Date.now())

  const event = useQuery({ queryKey: eventKeys.one(id), queryFn: () => fetchEvent(id) })
  // La mateixa clau que la fitxa, que és d'on es ve: el resum ja hi és.
  const desde = dayStartIso(new Date(now))
  const summaries = useQuery({
    queryKey: homeKeys.summaries([id], desde),
    queryFn: () => fetchSummaries([id], desde),
  })
  const demana = useQuery({
    queryKey: viatgerKeys.demana(id),
    queryFn: () => fetchDemanaViatger(id),
  })
  const meves = useQuery({
    queryKey: viatgerKeys.meves(id, userId),
    queryFn: () => fetchMevesDades(id, userId),
    // Ni un segon a la cau quan la pantalla es tanca, i sempre de la base en
    // obrir-la: són els tretze camps sencers, i en un mòbil compartit la cau
    // és el lloc on sobreviurien a qui els va escriure.
    gcTime: 0,
    staleTime: 0,
  })

  if (event.isPending || summaries.isPending || demana.isPending || meves.isPending) {
    return <ViatgerSkeleton />
  }

  const back = `/esdeveniment/${id}`
  const titol = event.data == null ? t('actions.back') : eventTitle(event.data.titulo)

  const failed = [event, summaries, demana, meves].find((q) => q.isError)
  if (failed !== undefined) {
    return (
      <Shell back={back} label={titol} title={t('viatger.title')}>
        <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(failed.error))}
        </p>
        <button
          type="button"
          onClick={() => {
            for (const q of [event, summaries, demana, meves]) void q.refetch()
          }}
          className="-ml-2 mt-6 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
        >
          {t('actions.retry')}
        </button>
      </Shell>
    )
  }

  const e = event.data
  const esborren = e == null ? null : esborrenEl(e.starts_at, e.ends_at)
  const apuntat = esApuntat(summaryOf(summaries.data ?? [], id).mine)

  // Les tres raons per no ensenyar el formulari, cadascuna amb la seva frase:
  // que no se'n demanen, que encara no hi vas, i que ja és massa tard.
  const motiu =
    e == null || !demana.data || e.tipo === 'reunio'
      ? t('viatger.notAsked')
      : !apuntat
        ? t('viatger.notGoing')
        : esborren !== null && esborren.getTime() <= now
          ? t('viatger.closed')
          : null

  if (motiu !== null || esborren === null) {
    return (
      <Shell back={back} label={titol} title={t('viatger.title')}>
        <p className="text-md text-fg-secondary [text-wrap:pretty]">{motiu}</p>
        <Link
          to={back}
          className="-ml-2 mt-6 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
        >
          {t('viatger.backToEvent')}
        </Link>
      </Shell>
    )
  }

  return (
    <Shell back={back} label={titol} title={t('viatger.title')}>
      <Formulari
        key={meves.data?.updated_at ?? 'nou'}
        eventId={id}
        userId={userId}
        inicial={meves.data == null ? BUIT : esborranyDe(meves.data)}
        existeix={meves.data != null}
        dia={formatDateLong(esborren, locale)}
        online={online}
        onFet={async () => {
          await client.invalidateQueries({ queryKey: viatgerKeys.totes(id) })
          void navigate(back, { replace: true })
        }}
      />
    </Shell>
  )
}

function Shell({
  back,
  label,
  title,
  children,
}: {
  readonly back: string
  readonly label: string
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to={back} label={label} title={title} />
      <div className={`pt-8 ${GUTTER}`}>{children}</div>
    </main>
  )
}

function ViatgerSkeleton() {
  return (
    <Skeleton className="with-tabbar min-h-dvh bg-app">
      <div className={`pt-14 ${GUTTER}`}>
        <SkeletonBar w="w-[60%]" h="h-[28px]" />
        <SkeletonBar w="w-full" h="h-[140px]" className="mt-9" />
        <SkeletonBar w="w-full" h="h-[50px]" className="mt-12" />
        <SkeletonBar w="w-full" h="h-[50px]" className="mt-9" />
        <SkeletonBar w="w-full" h="h-[50px]" className="mt-9" />
      </div>
    </Skeleton>
  )
}

function Formulari({
  eventId,
  userId,
  inicial,
  existeix,
  dia,
  online,
  onFet,
}: {
  readonly eventId: string
  readonly userId: string
  readonly inicial: EsborranyViatger
  readonly existeix: boolean
  readonly dia: string
  readonly online: boolean
  readonly onFet: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const base = useId()

  const [d, setD] = useState<EsborranyViatger>(inicial)
  const [tocats, setTocats] = useState<ReadonlySet<CampViatger>>(new Set())
  const [intentat, setIntentat] = useState(false)
  const [esborrant, setEsborrant] = useState(false)

  const paisos = useMemo(() => paisosOrdenats(INTL_LOCALE[locale]), [locale])
  const avui = toDateInput(new Date().toISOString(), APP_TIME_ZONE)
  const lectura = llegeixViatger(d, avui)
  const problemes = lectura.ok ? new Set<CampViatger>() : lectura.problemes
  const mostra = (camp: CampViatger) => problemes.has(camp) && (intentat || tocats.has(camp))

  const desa = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      if (!lectura.ok) throw new Error('formulari incomplet')
      await desaMevesDades(eventId, userId, lectura.fila)
    },
    onSuccess: onFet,
  })

  const esborra = useMutation({
    networkMode: 'always',
    mutationFn: () => esborraMevesDades(eventId, userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: viatgerKeys.totes(eventId) })
      await onFet()
    },
  })

  // Sense xarxa, la frase general parla de «veure això»; aquí el que importa
  // és que no ha sortit res i que el formulari encara hi és.
  const frase = (err: unknown) =>
    errorKey(err) === 'errors.offline' ? t('viatger.notSent') : t(errorKey(err))

  const posa = <K extends CampViatger>(camp: K, valor: EsborranyViatger[K]) => {
    setD((ara) => ({ ...ara, [camp]: valor }))
  }
  const surt = (camp: CampViatger) => () => {
    setTocats((ara) => new Set(ara).add(camp))
  }

  // Les propietats que comparteix cada camp: el nom accessible, l'estat i la
  // frase que el descriu quan no val.
  const camp = (c: CampViatger, label: string) => ({
    'aria-label': label,
    'aria-invalid': mostra(c),
    'aria-describedby': mostra(c) ? `${base}-${c}` : undefined,
    onBlur: surt(c),
    className: `${INPUT} ${mostra(c) ? BAD : ''}`,
  })

  const error = (c: CampViatger, text: string) =>
    mostra(c) ? (
      <p id={`${base}-${c}`} className="mt-4 text-sm font-bold text-warning [text-wrap:pretty]">
        {text}
      </p>
    ) : null

  // Tres opcions curtes (quatre, en dues files) es trien amb un toc, no amb un desplegable: es veuen
  // totes i no amaguen res darrere d'un altre pas.
  const triaUn = <K extends 'sexe' | 'tipus_document'>(
    c: K,
    opcions: readonly NonNullable<EsborranyViatger[K]>[],
    etiqueta: (o: string) => string,
  ) => (
    <div className={`mt-4 grid gap-4 ${opcions.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {opcions.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={d[c] === o}
          onClick={() => {
            posa(c, o)
            setTocats((ara) => new Set(ara).add(c))
          }}
          className={
            'flex min-h-[48px] items-center justify-center px-3 py-3 text-md font-bold [text-wrap:balance] ' +
            (d[c] === o
              ? 'bg-brand-cta text-on-brand'
              : `border-[1.5px] bg-surface-1 text-fg-secondary ${mostra(c) ? BAD : 'border-surface-7'}`)
          }
        >
          {etiqueta(o)}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <Notice as="div" tone="neutral">
        <p className="text-md font-bold text-fg [text-wrap:pretty]">{t('viatger.privacy.what')}</p>
        <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">
          {t('viatger.privacy.who')}
        </p>
        <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
          {t('viatger.privacy.when', { date: dia })}
        </p>
        <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
          {t('viatger.privacy.noPhoto')}
        </p>
      </Notice>

      <form
        noValidate
        className="pt-12"
        onSubmit={(ev) => {
          ev.preventDefault()
          setIntentat(true)
          if (lectura.ok) desa.mutate()
        }}
      >
        <h2 className="eyebrow pb-8 text-fg-muted">{t('viatger.section.who')}</h2>

        <Field label={t('viatger.field.nom')}>
          <input
            {...camp('nom', t('viatger.field.nom'))}
            value={d.nom}
            onChange={(ev) => {
              posa('nom', ev.target.value)
            }}
            name="given-name"
            autoComplete="given-name"
            autoCapitalize="words"
            maxLength={MAX_NOM + 10}
          />
          {error('nom', t('viatger.bad.nom'))}
        </Field>

        <Field label={t('viatger.field.cognom1')}>
          <input
            {...camp('cognom1', t('viatger.field.cognom1'))}
            value={d.cognom1}
            onChange={(ev) => {
              posa('cognom1', ev.target.value)
            }}
            name="family-name"
            autoComplete="family-name"
            autoCapitalize="words"
            maxLength={MAX_NOM + 10}
          />
          {error('cognom1', t('viatger.bad.cognom1'))}
        </Field>

        <Field label={t('viatger.field.cognom2')} hint={t('viatger.hint.cognom2')}>
          <input
            {...camp('cognom2', t('viatger.field.cognom2'))}
            value={d.cognom2}
            onChange={(ev) => {
              posa('cognom2', ev.target.value)
            }}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={MAX_NOM + 10}
          />
          {error('cognom2', t('viatger.bad.cognom2', { max: MAX_NOM }))}
        </Field>

        <Field label={t('viatger.field.sexe')}>
          {triaUn('sexe', SEXES, (o) => t(`viatger.sexe.${o}`))}
          {error('sexe', t('viatger.bad.sexe'))}
        </Field>

        <Field label={t('viatger.field.data_naixement')}>
          <input
            {...camp('data_naixement', t('viatger.field.data_naixement'))}
            type="date"
            value={d.data_naixement}
            onChange={(ev) => {
              posa('data_naixement', ev.target.value)
            }}
            min="1900-01-01"
            max={avui}
            autoComplete="bday"
          />
          {error('data_naixement', t('viatger.bad.data_naixement'))}
        </Field>

        <Field label={t('viatger.field.nacionalitat')}>
          <select
            {...camp('nacionalitat', t('viatger.field.nacionalitat'))}
            value={d.nacionalitat}
            onChange={(ev) => {
              posa('nacionalitat', ev.target.value)
              setTocats((ara) => new Set(ara).add('nacionalitat'))
            }}
            autoComplete="off"
          >
            <option value="">{t('viatger.choose')}</option>
            {paisos.map((p) => (
              <option key={p.codi} value={p.codi}>
                {p.nom}
              </option>
            ))}
          </select>
          {error('nacionalitat', t('viatger.bad.nacionalitat'))}
        </Field>

        <h2 className="eyebrow pt-6 pb-8 text-fg-muted">{t('viatger.section.document')}</h2>

        <Field label={t('viatger.field.tipus_document')}>
          {triaUn('tipus_document', TIPUS_DOCUMENT, (o) => t(`viatger.document.${o}`))}
          {error('tipus_document', t('viatger.bad.tipus_document'))}
        </Field>

        <Field label={t('viatger.field.numero_document')}>
          <input
            {...camp('numero_document', t('viatger.field.numero_document'))}
            value={d.numero_document}
            onChange={(ev) => {
              posa('numero_document', ev.target.value)
            }}
            className={`${INPUT} tabular uppercase ${mostra('numero_document') ? BAD : ''}`}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
          />
          {error('numero_document', t('viatger.bad.numero_document'))}
        </Field>

        {portaSuport(d.tipus_document) ? (
          <Field
            label={t('viatger.field.numero_suport')}
            hint={t(`viatger.hint.suport.${d.tipus_document}`)}
          >
            <input
              {...camp('numero_suport', t('viatger.field.numero_suport'))}
              value={d.numero_suport}
              onChange={(ev) => {
                posa('numero_suport', ev.target.value)
              }}
              className={`${INPUT} tabular uppercase ${mostra('numero_suport') ? BAD : ''}`}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={30}
            />
            {error('numero_suport', t('viatger.bad.numero_suport'))}
          </Field>
        ) : null}

        <h2 className="eyebrow pt-6 pb-8 text-fg-muted">{t('viatger.section.home')}</h2>

        <Field label={t('viatger.field.adreca')}>
          <input
            {...camp('adreca', t('viatger.field.adreca'))}
            value={d.adreca}
            onChange={(ev) => {
              posa('adreca', ev.target.value)
            }}
            name="street-address"
            autoComplete="street-address"
            maxLength={MAX_ADRECA + 10}
          />
          {error('adreca', t('viatger.bad.adreca'))}
        </Field>

        <Field label={t('viatger.field.localitat')}>
          <input
            {...camp('localitat', t('viatger.field.localitat'))}
            value={d.localitat}
            onChange={(ev) => {
              posa('localitat', ev.target.value)
            }}
            name="address-level2"
            autoComplete="address-level2"
            maxLength={MAX_LOCALITAT + 10}
          />
          {error('localitat', t('viatger.bad.localitat'))}
        </Field>

        <Field label={t('viatger.field.pais')}>
          <select
            {...camp('pais', t('viatger.field.pais'))}
            value={d.pais}
            onChange={(ev) => {
              posa('pais', ev.target.value)
              setTocats((ara) => new Set(ara).add('pais'))
            }}
            name="country"
            autoComplete="country"
          >
            <option value="">{t('viatger.choose')}</option>
            {paisos.map((p) => (
              <option key={p.codi} value={p.codi}>
                {p.nom}
              </option>
            ))}
          </select>
          {error('pais', t('viatger.bad.pais'))}
        </Field>

        <h2 className="eyebrow pt-6 pb-8 text-fg-muted">{t('viatger.section.emergency')}</h2>

        <Field
          label={t('viatger.field.telefon_emergencia')}
          hint={t('viatger.hint.telefon_emergencia')}
        >
          <input
            {...camp('telefon_emergencia', t('viatger.field.telefon_emergencia'))}
            value={d.telefon_emergencia}
            onChange={(ev) => {
              posa('telefon_emergencia', ev.target.value)
            }}
            className={`${INPUT} tabular ${mostra('telefon_emergencia') ? BAD : ''}`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={24}
          />
          {error('telefon_emergencia', t('viatger.bad.telefon_emergencia'))}
        </Field>

        {!online ? (
          <Notice className="mb-8" live>
            {t('viatger.offline')}
          </Notice>
        ) : null}

        {intentat && !lectura.ok ? (
          <p role="alert" className="pb-8 text-md font-bold text-warning [text-wrap:pretty]">
            {t('viatger.fixFirst')}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={desa.isPending || esborra.isPending}>
          {desa.isPending ? t('state.saving') : t('viatger.save')}
        </Button>

        {desa.isError ? (
          <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
            {frase(desa.error)}
          </p>
        ) : null}
      </form>

      {existeix ? (
        <section className="pt-14">
          {esborrant ? (
            <Confirm
              className="border border-warning p-7"
              cta={t('viatger.deleteCta')}
              cancel={t('actions.cancel')}
              busy={esborra.isPending}
              onConfirm={() => {
                esborra.mutate()
              }}
              onCancel={() => {
                setEsborrant(false)
              }}
            >
              <p className="text-md font-bold [text-wrap:pretty]">{t('viatger.deleteSure')}</p>
            </Confirm>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                setEsborrant(true)
              }}
            >
              {t('viatger.delete')}
            </Button>
          )}
          {esborra.isError ? (
            <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
              {frase(esborra.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
