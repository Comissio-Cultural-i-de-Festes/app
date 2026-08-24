/**
 * The bundle entry for design-sync (`--entry`), and the only file in this
 * repo written for it. The app never imports it.
 *
 * app-comi is an application, not a published component library: there is no
 * `dist/` of compiled components and no `exports` map, so nothing tells the
 * converter what the design system IS. This file does — one explicit list of
 * everything that becomes a component in the published library. Adding a
 * component to it means adding a line here and an entry in
 * `.design-sync/config.json`'s `componentSrcMap`.
 *
 * It also carries `DesignPreviewProviders`, the wrapper `cfg.provider` puts
 * around every preview card: several of the pieces below read context — i18n
 * for their copy, the router for `<Link>`, react-query for cached data — and
 * render blank or throw without it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'

import i18n from '@/i18n'

/* ── src/ui — the design system proper ─────────────────────────────────── */
export { Avatar } from '@/ui/Avatar/Avatar'
export { Button, ButtonGroup } from '@/ui/Button/Button'
export { FieldShell, TextField } from '@/ui/Field/Field'
export { LogoMark, Wordmark } from '@/ui/Logo/Logo'
export { TabBar } from '@/ui/TabBar/TabBar'
export { HomeIcon, ProfileIcon, ProposalsIcon, QrIcon, RankingIcon } from '@/ui/TabBar/icons'

/* ── src/features — the pieces that draw rather than fetch ─────────────── */
export { GoogleButton } from '@/features/entry/GoogleButton'
export { Cover, Fact, Places } from '@/features/event/detail'
export { JuntaHeader } from '@/features/junta/JuntaHeader'
export { ExitPhotoCard } from '@/features/photos/ExitPhotoCard'
export { CarDrawing } from '@/features/rides/CarDrawing'
export { ShareCard } from '@/features/share/ShareCard'

/**
 * Previews never fetch: a failed query must fall straight through to the
 * component's empty state instead of retrying for thirty seconds behind a
 * screenshot. A card that genuinely needs data seeds the cache itself.
 */
/**
 * Catalan, always. The app's detector reads the browser's language, and a
 * headless chromium says `en-US` — so without this every preview card would
 * be captured in a language the association does not use.
 */
void i18n.changeLanguage('ca')

const previewQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false },
  },
})

/**
 * Cached data for one preview cell, from the bundle's own react-query.
 *
 * A preview cannot bring its own `QueryClientProvider`: importing
 * @tanstack/react-query into the card compiles a SECOND copy of the library,
 * whose context the bundled component never reads — the provider would be
 * there and the cache would look empty. Seeding has to happen on this side of
 * the bundle boundary, and per cell, so two cells can show two states of the
 * same query.
 */
export function PreviewQuery({
  seed,
  children,
}: {
  readonly seed: readonly (readonly [readonly unknown[], unknown])[]
  readonly children: ReactNode
}) {
  const [client] = useState(() => {
    const c = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
    })
    for (const [key, data] of seed) c.setQueryData(key, data)
    return c
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * The three contexts this library reads: i18n for its Catalan copy, a router
 * for `<Link>`, react-query for cached data. **This is the wrapper a real
 * screen wants** — it adds no markup and no styling of its own, so it changes
 * nothing about layout.
 */
export function AppComiProviders({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={previewQueryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/**
 * `AppComiProviders` plus the preview card's own frame — **for the card grid
 * only**, never for a screen.
 *
 * The dark padded surface is not decoration: a card holds one component with
 * nothing around it, and these are drawn for `--ds-bg-app` with no light
 * theme, so an unpainted cell would show colours the app never puts on screen.
 * A screen gets that background from `base.css` instead.
 */
export function DesignPreviewProviders({ children }: { readonly children: ReactNode }) {
  return (
    <AppComiProviders>
      <div
        style={{
          background: 'var(--ds-bg-app)',
          color: 'var(--ds-text-primary)',
          fontFamily: 'var(--ds-font-body)',
          padding: '24px',
          minHeight: '100%',
        }}
      >
        {children}
      </div>
    </AppComiProviders>
  )
}
