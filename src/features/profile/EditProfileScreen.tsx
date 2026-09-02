import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileKeys } from '@/features/session/profile'
import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Button } from '@/ui/Button/Button'
import { TextField } from '@/ui/Field/Field'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { clearMyPhoto, revertToGooglePhoto, setMyName, setMyPhoto } from './api'
import { PhotoSheet } from './PhotoSheet'

/**
 * La foto i el nom. Res més.
 *
 * PER QUÈ NOMÉS DUES COSES. L'escola, el curs i el grau van al rànquing i els
 * punts van a una escola: canviar-la a mig curs mouria la taula de tothom, i
 * no és una preferència sinó un fet que la junta va comprovar. Surten a la
 * pantalla, en gris i amb el motiu escrit, perquè treure-les del tot faria
 * buscar-les; el que no tenen és cap control.
 *
 * `JuntaHeader` I NO UN CAPÇAL PROPI. És el capçal de qualsevol pantalla sense
 * barra de pestanyes, i això inclou les de soci —ho diu el seu propi comentari.
 * El nom del component és herència de la primera pantalla que el va necessitar.
 *
 * LA FOTO ES DESA SOLA I EL NOM AMB EL BOTÓ. No és una incoherència: triar una
 * foto ja és la confirmació —s'ha obert un full, s'ha triat una imatge, es veu
 * el resultat— i deixar-la esperant un «Desa» vol dir que qui tanqui la
 * pantalla es queda sense. Escriure un nom no és cap confirmació: és un camp a
 * mig omplir fins que algú diu que ja està.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

function EditSkeleton() {
  return (
    <Skeleton className="with-tabbar min-h-dvh bg-app">
      <div className={`pt-11 ${GUTTER}`}>
        <SkeletonBar w="w-[112px]" h="h-[112px]" className="mx-auto rounded-full" />
        <SkeletonBar w="w-full" h="h-[48px]" className="mt-9" />
        <SkeletonBar w="w-[80%]" h="h-[13px]" className="mx-auto mt-5" />
        <SkeletonBar w="w-full" h="h-[76px]" className="mt-14" />
        <SkeletonBar w="w-full" h="h-[60px]" className="mt-14" />
      </div>
    </Skeleton>
  )
}

export function EditProfileScreen() {
  const { t } = useTranslation()
  const userId = useUserId()
  const queryClient = useQueryClient()
  const nameId = useId()
  const { data: profile, isPending } = useMyProfile()

  // El nom desat és el valor per defecte del camp, i l'estat només guarda el
  // que s'hagi escrit a sobre. Amb un `useState('')` sincronitzat per un
  // efecte, el camp sortiria buit al primer render —el perfil arriba
  // després— i «Desa» hauria esborrat el nom de qui premés de pressa.
  const [draft, setDraft] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [saved, setSaved] = useState(false)

  const name = draft ?? profile?.nombre ?? ''

  const refresh = () => queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) })

  const photo = useMutation({
    mutationFn: async (action: { kind: 'pick'; file: File } | { kind: 'google' } | { kind: 'clear' }) => {
      if (action.kind === 'pick') await setMyPhoto(userId, action.file)
      else if (action.kind === 'google') await revertToGooglePhoto(userId)
      else await clearMyPhoto(userId, profile?.avatar_url ?? null)
    },
    onSuccess: async () => {
      setPicking(false)
      await refresh()
    },
  })

  const rename = useMutation({
    mutationFn: (next: string) => setMyName(userId, next),
    onSuccess: async () => {
      setSaved(true)
      await refresh()
    },
  })

  if (isPending) return <EditSkeleton />

  const trimmed = name.trim()
  const school = [
    profile?.escola == null ? null : t(`escolaShort.${profile.escola satisfies Escola}`),
    profile?.curs == null ? null : t(`onboarding.year.${String(profile.curs)}`),
    profile?.grau ?? null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to="/perfil" label={t('nav.profile')} title={t('profile.photo.title')} />

      <section className={`pt-14 text-center ${GUTTER}`}>
        <span className="relative inline-block">
          <Avatar src={profile?.avatar_url ?? null} size={112} />
        </span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={photo.isPending}
          className="mt-9 flex min-h-[48px] w-full items-center justify-center border-[1.5px] border-border-strong bg-surface-2 px-7 py-6 font-body text-lg font-bold text-fg disabled:opacity-45 [text-wrap:balance]"
        >
          {photo.isPending ? t('state.saving') : t('profile.photo.change')}
        </button>
        <p className="mt-5 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('profile.photo.where')}
        </p>
        {photo.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(photo.error))}
          </p>
        ) : null}
      </section>

      <section className={`pt-14 ${GUTTER}`}>
        <TextField
          id={nameId}
          label={t('profile.name.label')}
          value={name}
          onChange={(e) => {
            setDraft(e.target.value)
            setSaved(false)
          }}
          autoComplete="name"
          enterKeyHint="done"
          required
        />
        <p className="mt-5 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('profile.name.hint')}
        </p>
      </section>

      {/* Els camps que no es toquen aquí. En gris i amb el motiu, no amagats:
          qui els vingui a buscar ha de trobar-los i entendre per què no hi són.
          */}
      <section className={`pt-14 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('profile.locked.title')}</h2>
        <div className="flex items-center gap-3 border-b border-surface-4 py-[15px]">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg-muted">
              {t('profile.locked.school')}
            </span>
            <span className="mt-[3px] block text-sm-lo text-fg-muted-lo">
              {school === '' ? t('profile.locked.none') : school}
            </span>
          </span>
        </div>
        <p className="mt-5 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('profile.locked.why')}
        </p>
      </section>

      <section className={`pt-14 pb-12 ${GUTTER}`}>
        <Button
          size="lg"
          disabled={trimmed === '' || trimmed === profile?.nombre || rename.isPending}
          onClick={() => rename.mutate(trimmed)}
        >
          {rename.isPending ? t('state.saving') : t('actions.save')}
        </Button>
        {/* Una línia i no una caixa, com les quatre confirmacions de la junta.
            `role="status"` perquè apareix mentre algú mira la pantalla. */}
        {rename.isError ? (
          <p role="alert" className="mt-5 text-center text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(rename.error))}
          </p>
        ) : saved ? (
          <p role="status" className="mt-5 text-center text-md font-bold text-success">
            {t('profile.name.saved')}
          </p>
        ) : (
          <p className="mt-5 text-center text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
            {t('profile.name.everywhere')}
          </p>
        )}
      </section>

      {picking ? (
        <PhotoSheet
          hasPhoto={profile?.avatar_url != null}
          onPick={(file) => photo.mutate({ kind: 'pick', file })}
          onGoogle={() => photo.mutate({ kind: 'google' })}
          onClear={() => photo.mutate({ kind: 'clear' })}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </main>
  )
}
