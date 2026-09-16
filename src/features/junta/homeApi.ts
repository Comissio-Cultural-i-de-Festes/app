import { DbError } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * What the rebedor knows before it draws anything.
 *
 * One call rather than six, so the screen has one loading state and one thing
 * that can fail. Which parts are allowed to wait is a design decision the
 * prototype states out loud: the door panel and the numbers, never the
 * navigation rows.
 *
 * AQUÍ NO HI HA `de_pagament`, I ÉS A POSTA. La funció el torna des de la
 * migració 28 i el client no l'ha llegit mai. Quan una activitat és de franc,
 * qui ho respon és `no_pagats`, que des de la 69 ja val zero: l'avís, el
 * subtítol, la rodona de la fila de Pagaments i la suma de «hi ha feina» surten
 * les quatre d'aquest mateix número i no s'han de tornar a preguntar res.
 *
 * L'ALTRA OPCIÓ ERA DECLARAR-LO I NO FER-LO SERVIR, que és on era. Un camp
 * tipat que ningú no llegeix és una invitació: la cinquena superfície que
 * s'afegeixi el trobarà i es dibuixarà la seva pròpia guarda, i llavors hi
 * haurà dues regles per a la mateixa pregunta i un dia no diran el mateix.
 *
 * I no s'ha tret del `jsonb`: seria un `create or replace` sobre una funció
 * `security definer` —que torna a donar EXECUTE a PUBLIC, i en aquest repo això
 * ja s'ha pagat un cop— a canvi de res que es vegi. El que enganyava era el
 * tipus, i el tipus diu el que la pantalla llegeix.
 */

export interface DoorNow {
  readonly id: string
  readonly titulo: string
  readonly starts_at: string
  readonly ubicacion: string | null
  readonly plazas: number | null
  readonly diuen_si: number
  readonly fitxats: number
  /** Waiting for a place and waiting for a decision, added together. */
  readonly esperen: number
  /**
   * Qui ve i encara no ha passat pel Bizum, i zero quan no hi ha res a cobrar.
   * La condició del preu viu a la funció, no aquí.
   */
  readonly no_pagats: number
  /**
   * Fotos de la gimcana esperant que algú digui si valen, i `null` quan
   * l'esdeveniment no en té cap. Zero i cap no són el mateix: amb zero el camí
   * cap a la cua ha de sortir igual, perquè durant una festa s'omple i es
   * buida cada pocs minuts i és quan està buida que algú hi va a mirar.
   */
  readonly gimcana_cua: number | null
}

export interface JuntaHomeData {
  readonly porta: DoorNow | null
  readonly pendents: number
  readonly esborranys: number
  readonly propers: number
  readonly socis: number
}

export const juntaHomeKeys = {
  home: () => ['junta', 'home'] as const,
}

export async function fetchJuntaHome(): Promise<JuntaHomeData> {
  const { data, error } = await supabase.rpc('junta_home')
  if (error) throw new DbError(error)
  return data as unknown as JuntaHomeData
}

/** How many free places, or null when the event has no cap. */
export function placesLeft(porta: DoorNow): number | null {
  return porta.plazas === null ? null : Math.max(0, porta.plazas - porta.diuen_si)
}
