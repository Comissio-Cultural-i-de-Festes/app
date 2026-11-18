import type { ComponentProps } from 'react'

import { SendNote } from '@/features/shell/SendNote'

/**
 * La línia sota el «sí» quan la resposta no ha arribat.
 *
 * Sense xarxa, el botó es quedava a «Actualitzant…», apagat, sense cap frase, i
 * qui tancava l'app pensant que ja estava perdia la resposta sense saber-ho.
 * Tres llocs diuen «sí» —la fitxa, l'Inici i la targeta de la revelació— i tots
 * tres ho feien igual. Els tres casos els decideix `SendNote`; aquí hi ha les
 * frases que parlen de la resposta.
 *
 * AVÍS, NO CUA. Una cua sobreviuria a tancar l'app, però `set_attendance` no és
 * idempotent sobre cap identificador de petició, i un «sí» que arriba hores
 * més tard pot trobar l'esdeveniment ple i acabar a la llista d'espera sense
 * que ningú ho hagi vist decidir. Fer-ho bé voldria dir una migració; dir-ho
 * clar no. La pausa ja l'envia sola quan torna la xarxa mentre l'app és oberta,
 * i és el que diu la frase.
 */

const ANSWER_WORDS = {
  paused: 'event.ask.paused',
  slow: 'event.ask.slow',
  offline: 'event.ask.offline',
} as const

export function AnswerNote({
  answer,
  className = '',
}: {
  readonly answer: ComponentProps<typeof SendNote>['send']
  readonly className?: string
}) {
  return <SendNote send={answer} words={ANSWER_WORDS} className={className} />
}
