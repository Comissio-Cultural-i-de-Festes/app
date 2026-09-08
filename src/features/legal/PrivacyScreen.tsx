import { useTranslation } from 'react-i18next'

import { brand } from '@/config/brand'

import { LegalSection, LegalShell } from './LegalShell'

/**
 * La política de privadesa.
 *
 * ESCRITA DES DE L'ESQUEMA I NO D'UNA PLANTILLA. Cada frase d'aquí surt del que
 * la base de dades guarda de debò —les polítiques d'`04_rls.sql`, els grants de
 * columna de `03_grants.sql` i el que tornen les funcions `definer`—, i per això
 * diu coses que una plantilla no diria: que el directori és obert entre socis,
 * que treure's del rànquing no amaga els punts, o que tret del registre res no
 * s'esborra sol.
 *
 * EL QUE VOL DIR QUE ÉS CODI I NO UN DOCUMENT: si canvia qui pot llegir una
 * taula, aquest text queda mentint i no hi ha cap prova que ho detecti. Qualsevol
 * migració que toqui una política o un grant s'ha de llegir també des d'aquí.
 *
 * ELS APARTATS SÓN DADES i no JSX repetit quinze vegades: així afegir-ne un és
 * una línia aquí i tres claus al locale, i no hi ha manera d'oblidar-se un
 * paràgraf pel camí.
 *
 * EL PREFIX DE LES CLAUS VA ESCRIT SENCER a la plantilla —`legal.privacyBody.`
 * i no una variable— perquè el test de claus mortes llegeix el prefix fix d'un
 * `t(\`…\${…}\`)`. Amb una variable no en veuria cap i donaria tot el document
 * per inabastable.
 *
 * QUI RESPON SURT DE LA CONFIGURACIÓ, no del locale: `i18n-parity` rebutja el
 * nom de l'associació dins d'un fitxer de traducció, precisament perquè qui
 * bifurqui el repositori no se l'hereti. I el que no estigui posat es diu, no
 * s'amaga: una política amb un forat visible és honesta, i una que se salta la
 * línia fa pensar que no hi havia res a dir.
 */

interface Apartat {
  readonly id: string
  readonly paragraphs: number
}

const SECTIONS: readonly Apartat[] = [
  { id: 'who', paragraphs: 2 },
  { id: 'identity', paragraphs: 2 },
  { id: 'contact', paragraphs: 1 },
  { id: 'going', paragraphs: 2 },
  { id: 'photos', paragraphs: 3 },
  { id: 'where', paragraphs: 1 },
  { id: 'log', paragraphs: 2 },
  { id: 'keep', paragraphs: 2 },
  { id: 'others', paragraphs: 3 },
  { id: 'minors', paragraphs: 2 },
  { id: 'rights', paragraphs: 2 },
  { id: 'changes', paragraphs: 1 },
]

export function PrivacyScreen() {
  const { t } = useTranslation()

  // Els quatre es passen a tots els paràgrafs encara que només dos els facin
  // servir: i18next ignora el que no li demana la cadena, i així afegir una
  // menció de qui respon a un altre apartat no obliga a tocar res d'aquí.
  const qui = {
    entity: brand.legal.entity === '' ? t('legal.pending') : brand.legal.entity,
    taxId: brand.legal.taxId === '' ? t('legal.pending') : brand.legal.taxId,
    address: brand.legal.address === '' ? t('legal.pending') : brand.legal.address,
    contact: brand.legal.contact === '' ? t('legal.pending') : brand.legal.contact,
  }

  return (
    <LegalShell title={t('legal.privacy')} lead={t('legal.privacyBody.lead')}>
      {SECTIONS.map((apartat) => (
        <LegalSection
          key={apartat.id}
          title={t(`legal.privacyBody.${apartat.id}.title`)}
          paragraphs={Array.from({ length: apartat.paragraphs }, (_, i) =>
            t(`legal.privacyBody.${apartat.id}.p${String(i + 1)}`, qui),
          )}
        />
      ))}
    </LegalShell>
  )
}
