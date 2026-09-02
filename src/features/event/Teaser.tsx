import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { type Interest, eventKeys, fetchInterest, setInterest } from './api'
import { countdown } from './countdown'

/**
 * El que es pot dir d'un esdeveniment que encara no es pot dir.
 *
 * TOT EN VIOLETA. `--ds-unknown` és el color que l'escàner fa servir per
 * «aquest QR no és nostre», i vol dir exactament el mateix aquí: encara no se
 * sap. Ni ambre —no és cap perill— ni vermell, que és la marca. Aquesta és
 * l'única funció de l'app que fa servir aquell to fora de la porta, i és a
 * posta: qui l'ha vist una vegada el reconeix.
 *
 * EL COMPTE ENRERE NO ES REFRESCA SOL. Un `setInterval` d'un segon a l'Inici
 * vol dir un render per segon mentre algú mira la pantalla, i el que la xifra
 * guanya és un minut que baixa sol —que ningú no s'està mirant. Es calcula al
 * muntar i prou; qui torni a obrir l'app en veurà el nou. Els minuts hi són
 * perquè l'última hora tingui alguna cosa a dir, no perquè facin tic-tac.
 *
 * «AVISA'M» NO ÉS APUNTAR-SE, i el text ho diu perquè el botó sol no ho pot
 * dir: està al lloc on normalment hi ha «M'hi apunto» i, sense la línia de
 * sota, la gent premeria pensant que ja té plaça.
 */

/** El xip de la cantonada, a la pantalla de l'esdeveniment. */
export function HiddenChip() {
  const { t } = useTranslation()
  return (
    <p className="eyebrow-sm rounded-xs border border-[var(--ds-unknown)] px-4 py-3 text-unknown">
      {t('event.teaser.chip')}
    </p>
  )
}

/** El compte enrere gran de la pantalla de l'esdeveniment: tres blocs. */
export function BigCountdown({ revealAt }: { readonly revealAt: string }) {
  const { t } = useTranslation()
  const c = countdown(revealAt)

  const cell = (value: number, label: string) => (
    <div>
      <p className="tabular display text-d-lg leading-[0.85] tracking-[-0.05em]">
        {String(value).padStart(2, '0')}
      </p>
      <p className="mt-1 text-2xs font-extrabold tracking-[0.08em] uppercase text-fg-dim">
        {label}
      </p>
    </div>
  )

  const colon = (
    <p aria-hidden="true" className="display mb-[10px] text-d-sm leading-none text-surface-9">
      :
    </p>
  )

  return (
    <section className="mt-10 border-y border-surface-7 p-10">
      <p className="eyebrow-sm text-fg-muted">{t('event.teaser.willBeKnown')}</p>
      <div className="mt-4 flex items-end gap-6">
        {cell(c.days, t('event.teaser.days'))}
        {colon}
        {cell(c.hours, t('event.teaser.hours'))}
        {colon}
        {cell(c.minutes, t('event.teaser.minutes'))}
      </div>
    </section>
  )
}

/**
 * El botó, el recompte i la línia que explica què fa.
 *
 * Es busca les seves pròpies dades i entra a la pantalla en una línia, com
 * `ExitPhotoCard` i `StreakCard`.
 *
 * `networkMode` es queda com és: això no escriu a cap cua i sense connexió no
 * hi ha res a guardar —a diferència del fitxatge o les idees, que sí. Prémer
 * «Avisa'm» en un soterrani no ha de deixar cap rastre que després caldria
 * reconciliar amb el recompte del servidor.
 */
export function InterestBlock({
  eventId,
  size = 'default',
}: {
  readonly eventId: string
  /** `hero` és el de l'Inici, més compacte i sense les cares. */
  readonly size?: 'default' | 'hero'
}) {
  const { t } = useTranslation()
  const client = useQueryClient()

  const interest = useQuery({
    queryKey: eventKeys.interest(eventId),
    queryFn: () => fetchInterest(eventId),
  })

  const toggle = useMutation({
    mutationFn: (vol: boolean) => setInterest(eventId, vol),
    onSuccess: (next: Interest) => {
      // La resposta ja porta el recompte nou, o sigui que la pantalla no ha de
      // tornar a preguntar: es posa a la memòria cau i prou.
      client.setQueryData(eventKeys.interest(eventId), next)
    },
  })

  if (interest.isPending) {
    return (
      <Skeleton className={size === 'hero' ? 'pt-8' : 'pt-8'}>
        <SkeletonBar w="w-full" h={size === 'hero' ? 'h-[56px]' : 'h-[60px]'} />
        <SkeletonBar w="w-[80%]" h="h-[14px]" className="mt-5" />
      </Skeleton>
    )
  }

  const vol = interest.data?.vol ?? false
  const quants = interest.data?.quants ?? 0

  return (
    <div className="pt-8">
      {vol ? (
        // Ja premut. Una caixa verda i no el botó una altra vegada: el que fa
        // falta saber és què passarà i quan, no que es pot tornar a prémer.
        <div className="border-l-[3px] border-success bg-surface-2 px-9 py-8">
          <p className="text-base font-bold [text-wrap:pretty]">
            {t('event.teaser.done', { count: quants })}
          </p>
          <p className="mt-3 text-sm leading-[1.4] text-fg-muted [text-wrap:pretty]">
            {t('event.teaser.doneSub')}
          </p>
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(false)}
            className="mt-5 flex min-h-[44px] items-center font-body text-md font-bold text-fg-muted disabled:opacity-45"
          >
            {t('event.teaser.undo')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(true)}
            className={
              'flex w-full items-center justify-center border-0 rounded-cta bg-brand-cta ' +
              'font-body font-bold text-on-brand disabled:opacity-45 [text-wrap:balance] ' +
              (size === 'hero'
                ? 'min-h-[56px] px-[18px] py-[15px] text-2xl tracking-[-0.01em]'
                : 'min-h-[60px] px-[18px] py-9 text-2xl shadow-brand')
            }
          >
            {t('event.teaser.notify')}
          </button>
          <p className="mt-5 text-md-lo text-fg-muted [text-wrap:pretty]">
            {size === 'hero' ? t('event.teaser.notifySubShort') : t('event.teaser.notifySub')}
          </p>
        </>
      )}

      {toggle.isError ? (
        <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(toggle.error))}
        </p>
      ) : null}
    </div>
  )
}

/** «34 hi estan pendents», amb la xifra destacada. Per al hero. */
export function InterestCount({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()
  const interest = useQuery({
    queryKey: eventKeys.interest(eventId),
    queryFn: () => fetchInterest(eventId),
  })

  const quants = interest.data?.quants ?? 0
  if (interest.isPending || quants === 0) return null

  return (
    <div className="flex-none pb-1 text-right">
      <p className="tabular text-xl font-extrabold text-brand-accent">{String(quants)}</p>
      <p className="mt-[2px] text-sm-lo font-bold text-fg-muted [text-wrap:pretty]">
        {t('event.teaser.waiting', { count: quants })}
      </p>
    </div>
  )
}
