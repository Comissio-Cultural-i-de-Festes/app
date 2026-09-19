import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { memberSubtitle } from '@/features/member/subtitle'
import { profileKeys } from '@/features/session/profile'
import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Button } from '@/ui/Button/Button'
import { DoneLine } from '@/ui/Notice/DoneLine'
import { ROW } from '@/ui/Row/Row'
import { TextField } from '@/ui/Field/Field'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { clearMyPhoto, revertToGooglePhoto, setMyNameAndInstagram, setMyPhoto } from './api'
import { INSTAGRAM_MAX, isInstagramHandle, normaliseInstagram } from './instagram'
import { PhotoSheet } from './PhotoSheet'

/**
 * La foto, el nom i l'Instagram.
 *
 * PER QUÈ NOMÉS AQUESTES TRES. L'escola, el curs i el grau van al rànquing i els
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
 *
 * EL BOTÓ PORTA DUES COSES I ÉS UNA SOLA SENTÈNCIA. Les dues viuen a `profiles`
 * i van juntes a `setMyNameAndInstagram`: dos botons voldrien dir dos «Desat»
 * en una pantalla de tres camps, i dues crides voldrien dir que el nom es pot
 * desar mentre l'Instagram peta. Per això el `disabled` mira si ha canviat
 * qualsevol de les dues, i no només el nom com feia abans.
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
  const igId = useId()
  const igMsgId = useId()
  const { data: profile, isPending } = useMyProfile()

  // El nom desat és el valor per defecte del camp, i l'estat només guarda el
  // que s'hagi escrit a sobre. Amb un `useState('')` sincronitzat per un
  // efecte, el camp sortiria buit al primer render —el perfil arriba
  // després— i «Desa» hauria esborrat el nom de qui premés de pressa.
  const [draft, setDraft] = useState<string | null>(null)
  // El mateix per a l'Instagram, i pel mateix motiu. Aquí el valor desat pot ser
  // null —no en té— i el camp l'ha de dibuixar buit, no «null».
  const [igDraft, setIgDraft] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [saved, setSaved] = useState(false)

  const name = draft ?? profile?.nombre ?? ''
  const instagram = igDraft ?? profile?.instagram ?? ''

  const refresh = () => queryClient.invalidateQueries({ queryKey: profileKeys.of(userId) })

  const photo = useMutation({
    mutationFn: async (
      action: { kind: 'pick'; file: File } | { kind: 'google' } | { kind: 'clear' },
    ) => {
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
    mutationFn: (next: { nombre: string; instagram: string | null }) =>
      setMyNameAndInstagram(userId, next.nombre, next.instagram),
    onSuccess: async () => {
      setSaved(true)
      await refresh()
    },
  })

  if (isPending) return <EditSkeleton />

  const trimmed = name.trim()
  const igValue = normaliseInstagram(instagram)
  const igOk = igValue === null || isInstagramHandle(igValue)
  // Comparat contra el desat i no contra el text del camp: qui hi escrigui una
  // arrova davant del que ja hi tenia no ha canviat res, i el botó no s'ha
  // d'encendre per una cosa que desarà igual.
  const changed = trimmed !== profile?.nombre || igValue !== (profile?.instagram ?? null)
  const school = memberSubtitle({
    escola: profile?.escola == null ? null : t(`escolaShort.${profile.escola satisfies Escola}`),
    curs: profile?.curs == null ? null : t(`onboarding.year.${String(profile.curs)}`),
    grau: profile?.grau ?? null,
    // Res al final: aquesta és la teva pantalla i «soci des de» ja surt al teu
    // perfil, tres línies més amunt de l'enllaç que porta aquí.
    cua: null,
  })

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

      {/* L'arrova dibuixada davant i no dins del valor: diu què s'hi espera
          sense que ningú l'hagi d'escriure, i si algú l'escriu igualment
          `normaliseInstagram` la treu abans d'enviar-la. El que es desa és el
          nom d'usuari, mai una URL —la construeix `instagramUrl` en un sol
          lloc, i per això a la columna no hi cap res a injectar. */}
      <section className={`pt-9 ${GUTTER}`}>
        <TextField
          id={igId}
          label={t('profile.instagram.label')}
          prefix="@"
          value={instagram}
          onChange={(e) => {
            setIgDraft(e.target.value)
            setSaved(false)
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
          /* Trenta és el màxim del nom, i l'arrova que la gent escriu davant no
             hi compta: amb `maxLength={30}` un nom de trenta amb arrova es
             quedaria tallat a l'última lletra sense dir res. */
          maxLength={INSTAGRAM_MAX + 1}
          placeholder={t('profile.instagram.placeholder')}
          aria-invalid={!igOk}
          aria-describedby={igMsgId}
        />
        {/* LA LÍNIA DE SOTA ÉS LA DESCRIPCIÓ DEL CAMP, I HO DIU. `aria-invalid`
            sol anuncia «no vàlid» i cap manera de saber per què; és el mateix
            que van corregir les tres pantalles de junta d'aquest lot, i aquesta
            s'hi havia deixat.

            APUNTA-HI SEMPRE, no només quan falla: aquest `<p>` és la descripció
            del camp en els dos estats —què s'hi espera quan va bé, per què no
            val quan no—, i penjar-l'hi només en el cas dolent voldria dir que
            qui hi arribi amb el camp buit no sent res. `aria-live="polite"` i
            no `role="alert"` perquè el que el fa canviar és cada tecla: un
            `alert` interromp al mig de la paraula i se'n torna a anar a la tecla
            següent. Amb `polite` es diu sola quan el text canvia de debò —que
            és només en creuar la frontera— i espera torn. */}
        <p
          id={igMsgId}
          aria-live="polite"
          className={
            'mt-5 text-sm-lo leading-[1.4] [text-wrap:pretty] ' +
            (igOk ? 'text-fg-muted-lo' : 'text-warning')
          }
        >
          {igOk ? t('profile.instagram.hint') : t('profile.instagram.invalid')}
        </p>
      </section>

      {/* Els camps que no es toquen aquí. En gris i amb el motiu, no amagats:
          qui els vingui a buscar ha de trobar-los i entendre per què no hi són.
          */}
      <section className={`pt-14 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('profile.locked.title')}</h2>
        <div className={ROW}>
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
          disabled={trimmed === '' || !changed || !igOk || rename.isPending}
          onClick={() => {
            rename.mutate({ nombre: trimmed, instagram: igValue })
          }}
        >
          {rename.isPending ? t('state.saving') : t('actions.save')}
        </Button>
        {/* Una línia i no una caixa, com les quatre confirmacions de la junta;
            i la línia la pinta `DoneLine`, que és qui sap que ha de ser una
            regió viva. Escrita a mà aquí, era la cinquena còpia. */}
        {rename.isError ? (
          <p
            role="alert"
            className="mt-5 text-center text-md font-bold text-error [text-wrap:pretty]"
          >
            {t(errorKey(rename.error))}
          </p>
        ) : rename.isPaused ? (
          /* SENSE XARXA, REACT QUERY NO FALLA: PAUSA. El botó es queda a
             «Desant…» i desactivat fins que torni la cobertura, i abans d'això
             la pantalla no deia absolutament res —un botó apagat per sempre,
             sense cap `alert` ni cap `status`—.

             EL QUE NO ES FA ÉS `networkMode: 'always'`: aquesta mutació no
             escriu a cap cua —és un `update` directe a `profiles`— i amb
             `always` la crida sortiria igualment, petaria amb un error de xarxa
             i el que la persona ha escrit s'hauria perdut darrere d'un missatge
             genèric. La regla del repo és per a les mutacions que SÍ que
             escriuen a una cua, perquè allà la pausa amaga una feina ja feta;
             aquí la pausa és el comportament correcte i el que faltava era
             dir-ho.

             `role="status"` i no `alert`: no és cap error, és una espera. */
          <p
            role="status"
            className="mt-5 text-center text-sm-lo text-fg-muted-lo [text-wrap:pretty]"
          >
            {t('profile.name.waiting')}
          </p>
        ) : saved ? (
          <DoneLine className="mt-5 text-center" message={t('profile.name.saved')} />
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
