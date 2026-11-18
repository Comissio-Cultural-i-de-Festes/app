import { useTranslation } from 'react-i18next'

/**
 * Les dues cares d'una porta que encara no pot decidir.
 *
 * La sessió, el perfil abans del primer cop i l'entrada a la junta esperen
 * alguna cosa de la xarxa abans de saber cap on enviar ningú, i totes tres
 * tenien la mateixa frase escrita a mà. Mentre l'espera té sentit, «Un
 * segon…»; quan ja no en té —sense xarxa, o una xarxa que no contesta—, què
 * passa i un botó, perquè una pantalla amb una sola frase i res per prémer es
 * llegeix com una app penjada.
 */

export function GateWaiting() {
  const { t } = useTranslation()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-app">
      <p className="text-fg-muted">{t('state.loading')}</p>
    </main>
  )
}

export function GateUnreachable({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-app px-[var(--ds-gutter)]">
      <p role="alert" className="text-center text-lg font-bold text-error [text-wrap:pretty]">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-4 text-md font-bold text-brand-label"
      >
        {t('actions.retry')}
      </button>
    </main>
  )
}
