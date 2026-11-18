import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { brand } from '@/config/brand'
import { Button } from '@/ui/Button/Button'
import { LogoMark } from '@/ui/Logo/Logo'

import { IosInstallSteps } from './IosInstallSteps'
import { promptNativeInstall, useNativeInstallPrompt } from './installGate'

/**
 * Adding the app to the home screen.
 *
 * The brief calls this the screen with the most effect on adoption, so it is
 * built as a screen and not as a banner. It appears before signing in, because
 * on iOS the home-screen app has its own storage: install after signing in and
 * the icon opens to a signed-out app.
 *
 * Except when the link carries an invitation. Then the door goes first and
 * this comes back afterwards as `InstallCard` on the home screen: see
 * `shouldPromptInstall` for why the code would not survive the trip.
 *
 * It is skippable. "Not now" continues in Safari with a one-line warning that
 * signing in again from the icon will be needed, and comes back in a week.
 */

export interface InstallScreenProps {
  readonly onDone: () => void
  readonly onLater: () => void
}

export function InstallScreen({ onDone, onLater }: InstallScreenProps) {
  const { t } = useTranslation()
  const native = useNativeInstallPrompt()
  // La branca la tria el navegador; el botó, si queda diàleg per obrir. Amb el
  // diàleg gastat —l'ha descartat— la pantalla no ha de tornar als passos del
  // Safari: el que li queda és dir que ja ho té fet.
  const [spent, setSpent] = useState(false)

  // Amb diàleg natiu no hi ha res a explicar: els dos passos d'aquesta
  // pantalla són del Safari, i ensenyar-los a algú que té un botó que instal·la
  // l'app de debò seria ensenyar-li com fer-ho al mòbil d'algú altre.
  //
  // Tampoc l'avís de tornar a entrar: allà on hi ha diàleg, la instal·lació no
  // canvia de magatzem. És un fet de l'iPhone, no de totes les instal·lacions.
  if (native) {
    return (
      // `my-auto` en lloc de `justify-center`, i el motiu és una trampa, no un
      // símptoma: `justify-center` en un flex que fa scroll retalla per dalt
      // quan el contingut no hi cap, i el que queda amunt no es pot abastar ni
      // amb `scrollTop = 0`. Mesurat aquí: −74 px, el titular sencer fora.
      //
      // Avui no passa, perquè `min-h-dvh` deixa créixer la caixa i qui fa
      // scroll acaba sent el document. Però n'hi ha prou que algú fixi
      // l'alçada —o que un navegador ho faci per ell amb el teclat obert— per
      // caure-hi, i aquesta és l'única pantalla del camí d'Android. `my-auto`
      // centra igual quan hi ha espai i no pot amagar res quan no n'hi ha.
      <main
        className={
          'flex min-h-dvh flex-col overflow-y-auto bg-app px-[var(--ds-gutter)] ' +
          'pt-[max(calc(var(--ds-safe-top)+8px),12px)] pb-[calc(var(--ds-safe-bottom)+24px)]'
        }
      >
        <div className="my-auto">
          <h1 className="font-display text-d-md leading-[0.88] tracking-[-0.05em] uppercase">
            {t('install.title')}
          </h1>
          <p className="mt-[14px] text-lg text-fg-secondary [text-wrap:pretty]">
            {t('install.android.lede')}
          </p>

          <section className="mt-[26px] flex items-center gap-8 border border-surface-7 bg-surface-2 px-[18px] py-8">
            <div className="flex flex-none flex-col items-center gap-4">
              <LogoMark size={62} />
              <span className="text-xs-lo font-medium text-fg-secondary">{brand.shortName}</span>
            </div>
            <p className="flex-1 text-md text-fg-secondary [text-wrap:pretty]">
              {t('install.iconPreview')}
            </p>
          </section>

          <div className="mt-10">
            {spent ? (
              <Button size="lg" onClick={onDone}>
                {t('install.done')}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => {
                  // Acceptar-lo tanca la pantalla. Descartar-lo la deixa on
                  // era, però el diàleg ja no tornarà: el botó passa a ser el
                  // «ja ho tinc fet», que és l'única sortida que queda.
                  void promptNativeInstall().then((accepted) => {
                    if (accepted) onDone()
                    else setSpent(true)
                  })
                }}
              >
                {t('install.android.cta')}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={onLater}
            className={
              'mt-5 min-h-[44px] w-full cursor-pointer border-0 bg-transparent text-center ' +
              'text-md-lo font-semibold text-fg-muted [text-wrap:balance]'
            }
          >
            {t('install.later')}
          </button>
        </div>
      </main>
    )
  }

  return (
    // Sense `overflow-y-auto`, a diferència de la branca d'Android: el peu és
    // `sticky`, i un contenidor amb overflow passa a ser el seu marc de
    // referència. Com que `min-h-dvh` el deixa créixer i qui fa scroll és el
    // document, el peu es quedaria al final del contingut com si no hi fos.
    <main className="flex min-h-dvh flex-col bg-app">
      <div
        className={
          // Vuit píxels per damunt del safe-area, com HomeScreen i ScannerScreen.
          // Hi havia `pt-[var(--ds-safe-top)]` i, concatenat, un `pt-2`: guanyava
          // el primer —surt més tard al CSS generat— i el segon era codi mort. El
          // titular quedava enganxat a la barra d'estat sense cap coixí, i la
          // branca nativa no tenia ni safe-area.
          'px-[var(--ds-gutter)] pt-[max(calc(var(--ds-safe-top)+8px),12px)] pb-10'
        }
      >
        <h1 className="font-display text-d-md leading-[0.88] tracking-[-0.05em] uppercase">
          {t('install.title')}
        </h1>
        <p className="mt-[14px] text-lg text-fg-secondary [text-wrap:pretty]">
          {t('install.lede')}
        </p>

        <IosInstallSteps />

        {/* What they are about to end up with. The step before this one asks
            them to hunt for a row in a system sheet; this one tells them what
            success looks like, so they know when they have found it. */}
        <section className="mt-[26px] flex items-center gap-8 border border-surface-7 bg-surface-2 px-[18px] py-8">
          <div className="flex flex-none flex-col items-center gap-4">
            <LogoMark size={62} />
            <span className="text-xs-lo font-medium text-fg-secondary">{brand.shortName}</span>
          </div>
          <p className="flex-1 text-md text-fg-secondary [text-wrap:pretty]">
            {t('install.iconPreview')}
          </p>
        </section>

        <section className="mt-[22px] border-y border-surface-7 px-[18px] py-8">
          <h2 className="eyebrow text-[var(--ds-brand-accent-hi)]">{t('install.payoff.title')}</h2>
          <p className="mt-[10px] text-base text-fg-secondary [text-wrap:pretty]">
            {t('install.payoff.body')}
          </p>
        </section>

        {/* The reason skipping is allowed at all, said out loud rather than
            discovered later at the icon. Al final del contingut i no al peu:
            allà eren tres línies més tapant la pantalla tota l'estona, i
            quan s'arriba aquí a baix queda just damunt del botó que explica. */}
        <p className="mt-9 text-center text-sm text-fg-muted-lo [text-wrap:pretty]">
          {t('install.laterWarning')}
        </p>
      </div>

      {/* Fixats al peu. Al final del contingut quedaven a 936 i 1008 px d'una
          pàgina de 1143, o sigui que en un iPhone qualsevol no es veia cap de
          les dues sortides sense fer scroll, i qui no en veu cap tanca la
          pestanya. El vel és el de la barra de punts de la porta. */}
      <div
        className={
          'sticky bottom-0 z-10 mt-auto border-t border-surface-6 bg-[var(--ds-scrim-bar)] ' +
          'px-[var(--ds-gutter)] pt-7 pb-[calc(var(--ds-safe-bottom)+10px)] backdrop-blur-[14px]'
        }
      >
        <Button size="lg" onClick={onDone}>
          {t('install.done')}
        </Button>

        <button
          type="button"
          onClick={onLater}
          className={
            'mt-3 min-h-[44px] w-full cursor-pointer border-0 bg-transparent text-center ' +
            'text-md-lo font-semibold text-fg-muted [text-wrap:balance]'
          }
        >
          {t('install.later')}
        </button>
      </div>
    </main>
  )
}
