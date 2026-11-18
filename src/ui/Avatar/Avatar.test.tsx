import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar } from './Avatar'

/**
 * Una cara que no ha carregat torna quan arriba una URL nova.
 *
 * Una URL signada que es mostra un moment després d'haver caducat —una
 * pantalla que torna a muntar-se amb la de fa més d'una hora mentre se'n signa
 * una altra— falla, i l'avatar passava a les ratlles per sempre: la URL bona
 * arribava i ningú la mirava. L'error és d'una URL, no de la persona.
 */

const client = new QueryClient()

function face(src: string) {
  return (
    <QueryClientProvider client={client}>
      <Avatar src={src} size={32} />
    </QueryClientProvider>
  )
}

describe('Avatar', () => {
  it('torna a provar quan la URL canvia', () => {
    const { container, rerender } = render(face('https://img.example.test/vella.jpg'))

    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()

    rerender(face('https://img.example.test/nova.jpg'))
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://img.example.test/nova.jpg',
    )
  })

  it('i la que ha fallat es queda amagada', () => {
    const { container, rerender } = render(face('https://img.example.test/trencada.jpg'))
    fireEvent.error(container.querySelector('img')!)
    rerender(face('https://img.example.test/trencada.jpg'))
    expect(container.querySelector('img')).toBeNull()
  })
})
