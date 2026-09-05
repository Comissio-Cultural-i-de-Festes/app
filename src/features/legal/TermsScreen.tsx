import { useTranslation } from 'react-i18next'

import { LegalSection, LegalShell } from './LegalShell'

/**
 * Les condicions d'ús.
 *
 * NO SÓN UN CONTRACTE: són les normes que l'app ja aplica, escrites on es
 * puguin llegir. Els punts, l'estat pendent, què pot fer la junta i què passa
 * amb una foto denunciada són coses que el codi ja fa; l'única novetat d'aquest
 * text és que ara es poden llegir abans de topar-hi.
 *
 * L'APARTAT DE MODERACIÓ NO PROMET CAP TERMINI, a posta. La cua de fotos
 * denunciades la miren quatre persones entre classe i classe, i un «en 24
 * hores» seria una promesa que es trencaria el primer cap de setmana. El
 * compromís que sí es pot mantenir és que es mira, que es desfà si va ser un
 * error, i que qui ho demana no surt enlloc.
 *
 * La forma —els apartats com a dades i el prefix escrit sencer— és la mateixa
 * que a `PrivacyScreen`, i pel mateix motiu.
 */

interface Apartat {
  readonly id: string
  readonly paragraphs: number
}

const SECTIONS: readonly Apartat[] = [
  { id: 'what', paragraphs: 1 },
  { id: 'who', paragraphs: 1 },
  { id: 'you', paragraphs: 3 },
  { id: 'points', paragraphs: 2 },
  { id: 'junta', paragraphs: 1 },
  { id: 'moderation', paragraphs: 3 },
  { id: 'stop', paragraphs: 1 },
  { id: 'noguarantee', paragraphs: 1 },
]

export function TermsScreen() {
  const { t } = useTranslation()

  return (
    <LegalShell title={t('legal.terms')} lead={t('legal.termsBody.lead')}>
      {SECTIONS.map((apartat) => (
        <LegalSection
          key={apartat.id}
          title={t(`legal.termsBody.${apartat.id}.title`)}
          paragraphs={Array.from({ length: apartat.paragraphs }, (_, i) =>
            t(`legal.termsBody.${apartat.id}.p${String(i + 1)}`),
          )}
        />
      ))}
    </LegalShell>
  )
}
