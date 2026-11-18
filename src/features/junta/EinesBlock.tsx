import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { fetchTeGimcana, gimcanaKeys } from '@/features/gimcana/api'
import type { EventType } from '@/lib/model'
import type { EventRow } from '@/lib/schema'
import { NavRow } from '@/ui/Row/Row'

import { einesDe, portaOberta, rutaDe } from './eines'

/**
 * Les eines d'aquesta activitat, a la seva fitxa.
 *
 * Quines i per què és a `eines.ts`. Aquí només hi ha una decisió més: LLEGEIX
 * LA FILA DESADA, no el formulari. Les eines treballen sobre l'esdeveniment que
 * hi ha a la base —l'escàner d'un esborrany que ara mateix diu «publica» no
 * fitxa ningú fins que es desa—, i una fila que aparegués en tocar el tipus i
 * portés a una pantalla que encara no el veu seria una promesa falsa.
 *
 * LA FILA DE LA CUA DE LA GIMCANA ESPERA LA SEVA CONSULTA, i les altres no.
 * Mentre no se sap si n'hi ha, o si la consulta falla, simplement no hi és: la
 * gimcana té la seva pròpia fila just a sobre, i des d'allà s'hi arriba igual.
 * Aturar tot el bloc per una fila seria tornar a amagar l'escàner, que és el
 * defecte que aquest bloc existeix per treure.
 *
 * LES HORES DE LA MEMÒRIA NO HI SÓN, i és a posta. El seu camí viu dins de la
 * tira de les hores, al costat de si les han visat, perquè és allà on es mira
 * abans d'entrar-hi; repetir-lo aquí seria dos enllaços al mateix lloc a un
 * pam de distància, i en una casa rural, que no té hores, no hi pinta res.
 */
export function EinesBlock({ event }: { readonly event: EventRow }) {
  const { t } = useTranslation()
  const tipo = event.tipo as EventType
  const reunio = tipo === 'reunio'

  const gimcana = useQuery({
    queryKey: gimcanaKeys.existeix(event.id),
    queryFn: () => fetchTeGimcana(event.id),
    enabled: !reunio && event.published,
  })

  const fets = {
    tipo,
    starts_at: event.starts_at,
    published: event.published,
    precio_cents: event.precio_cents ?? 0,
    plazas: event.plazas,
    cal_confirmacio: event.cal_confirmacio ?? false,
    teGimcana: gimcana.data === true,
  }
  const eines = einesDe(fets)

  const lede = reunio
    ? t('junta.form.eines.ledeMeeting')
    : event.published
      ? t('junta.form.eines.lede')
      : t('junta.form.eines.ledeDraft')

  return (
    <div className="mb-9">
      <h3 className="eyebrow text-fg-muted">{t('junta.form.eines.title')}</h3>
      <p className="mt-[7px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">{lede}</p>
      <div className="mt-6 border-t border-surface-4">
        {eines.map((eina) => (
          <NavRow
            key={eina}
            to={rutaDe(eina, event.id)}
            title={t(`junta.form.eines.${eina}.title`)}
            sub={t(`junta.form.eines.${eina}.sub`)}
          />
        ))}
      </div>
      {/* Per què no hi ha escàner, en una festa d'aquí a tres setmanes. Sense
          la línia, la fila que falta sembla un error. */}
      {!reunio && event.published && !portaOberta(fets) ? (
        <p className="mt-5 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.form.eines.soon')}
        </p>
      ) : null}
    </div>
  )
}
