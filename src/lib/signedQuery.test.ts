import { describe, expect, it } from 'vitest'

import { createQueryClient } from './queryClient'
import {
  SIGNED_TTL_SECONDS,
  invalidateAccess,
  invalidateData,
  isSignedKey,
  revalidates,
  signedKey,
} from './signedQuery'

/**
 * Les URL signades no es tornen a signar quan l'app torna al primer pla.
 *
 * El defecte: cada tornada a l'app invalidava totes les consultes, i cada URL
 * que surt de Storage és nova —el testimoni porta la marca de temps—, o sigui
 * que el navegador tornava a baixar cada portada i cada cara. Aquí es prova la
 * regla que ho evita: la clau ho diu, la invalidació ho respecta, i els temps
 * no deixen mai a la memòria cau una URL que hagi caducat sense que se sàpiga.
 */

const MINUTE = 60_000
const TTL_MS = SIGNED_TTL_SECONDS * 1000

describe('signedKey', () => {
  it('marca la clau, i una clau qualsevol no ho és', () => {
    expect(isSignedKey(signedKey('event-covers', 'a/1.jpg'))).toBe(true)
    expect(isSignedKey(signedKey('avatars'))).toBe(true)
    expect(isSignedKey(['events', 'home'])).toBe(false)
    expect(isSignedKey(['gallery', 'urls', 'a/1.jpg'])).toBe(false)
  })

  it('no confon dos cubells amb el mateix camí', () => {
    expect(signedKey('event-covers', 'x.jpg')).not.toEqual(signedKey('avatars', 'x.jpg'))
  })
})

describe('els temps de les URL signades', () => {
  const client = createQueryClient()
  const signed = client.defaultQueryOptions({ queryKey: signedKey('event-covers', 'a/1.jpg') })
  const data = client.defaultQueryOptions({ queryKey: ['events', 'home'] })

  it('es tornen a signar abans que caduquin, amb marge per baixar la imatge', () => {
    expect(signed.staleTime).toBe(50 * MINUTE)
    expect(TTL_MS - (signed.staleTime as number)).toBeGreaterThanOrEqual(10 * MINUTE)
  })

  it('es guarden mentre la firma és viva, no mitja hora com la resta', () => {
    expect(signed.gcTime).toBe(TTL_MS)
    expect(signed.gcTime).toBeGreaterThan(data.gcTime!)
  })

  it('les dades JSON conserven el minut de sempre', () => {
    expect(data.staleTime).toBe(MINUTE)
  })
})

describe('invalidateData', () => {
  it('invalida les dades i deixa les URL signades tal com són', async () => {
    const client = createQueryClient()
    client.setQueryData(['events', 'home'], { reveal: false })
    client.setQueryData(signedKey('event-covers', 'a/1.jpg'), 'https://cdn.test/a')
    client.setQueryData(signedKey('avatars', 'b/2.jpg'), 'https://cdn.test/b')

    await invalidateData(client)

    const cache = client.getQueryCache()
    expect(cache.find({ queryKey: ['events', 'home'] })?.state.isInvalidated).toBe(true)
    expect(
      cache.find({ queryKey: signedKey('event-covers', 'a/1.jpg') })?.state.isInvalidated,
    ).toBe(false)
    expect(cache.find({ queryKey: signedKey('avatars', 'b/2.jpg') })?.state.isInvalidated).toBe(
      false,
    )
  })

  it('el predicat és el mateix que fa servir qualsevol altra invalidació', () => {
    const client = createQueryClient()
    client.setQueryData(['events'], 1)
    client.setQueryData(signedKey('door-photos', 'x'), 'https://cdn.test/x')
    const [events, door] = client.getQueryCache().getAll()
    expect(revalidates(events!)).toBe(true)
    expect(revalidates(door!)).toBe(false)
  })

  it('una entrada signada sense URL tampoc es torna a signar a cada tornada', async () => {
    // Un camí que torna `null` per sempre —l'objecte ja no hi és— no ha de
    // fer una petició cada cop que el telèfon surt de la butxaca.
    const client = createQueryClient()
    client.setQueryData(signedKey('event-covers', 'c/1.jpg'), null)

    await invalidateData(client)

    expect(
      client.getQueryCache().find({ queryKey: signedKey('event-covers', 'c/1.jpg') })?.state
        .isInvalidated,
    ).toBe(false)
  })
})

describe('invalidateAccess', () => {
  it('després d’un canvi de permisos, torna a demanar les sense URL i només aquestes', async () => {
    // El cas real: una persona pendent no pot signar portades; quan bescanvia
    // un codi, sí. No hi havia cap URL, o sigui que no hi ha res a rebaixar.
    const client = createQueryClient()
    client.setQueryData(['events', 'home'], { reveal: false })
    client.setQueryData(signedKey('event-covers', 'c/1.jpg'), null)
    client.setQueryData(signedKey('event-covers', 'c/2.jpg'), 'https://cdn.test/c2')

    await invalidateAccess(client)

    const cache = client.getQueryCache()
    const invalidated = (key: readonly unknown[]) =>
      cache.find({ queryKey: key })?.state.isInvalidated
    expect(invalidated(['events', 'home'])).toBe(true)
    expect(invalidated(signedKey('event-covers', 'c/1.jpg'))).toBe(true)
    expect(invalidated(signedKey('event-covers', 'c/2.jpg'))).toBe(false)
  })
})
