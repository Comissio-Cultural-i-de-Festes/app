import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The sign-in emails are microcopy too.
 *
 * They are easy to forget because almost nobody on the team ever sees them:
 * locally `enable_confirmations` is off, so the confirmation template never
 * fires, and the first time it does is on the hosted project, in front of
 * somebody who just signed up at the welcome event. Left alone it is
 * Supabase's English default.
 *
 * These cover the two things that actually break: the copy regressing to a
 * default, and the six-digit code going missing — which would silently strand
 * every iOS member who opened the app from the home screen.
 */

const config = readFileSync('supabase/config.toml', 'utf8')

interface Template {
  key: string
  subject: string
  path: string
  /**
   * What actually gets emailed: the file with its HTML comments stripped.
   *
   * Every content assertion runs against this rather than the raw file. These
   * templates explain their own rules in comments, so a check that reads the
   * whole file is satisfied by the documentation instead of the thing it
   * documents — deleting {{ .Token }} from the body left this suite green,
   * because the comment above it still mentioned the variable.
   */
  body: string
}

function readTemplates(): Template[] {
  const found: Template[] = []
  const block =
    /\[auth\.email\.template\.(\w+)\]\s*\nsubject\s*=\s*"([^"]*)"\s*\ncontent_path\s*=\s*"([^"]*)"/g

  for (const match of config.matchAll(block)) {
    const [, key = '', subject = '', rawPath = ''] = match
    const path = rawPath.replace(/^\.\//, '')
    const html = existsSync(path) ? readFileSync(path, 'utf8') : ''
    found.push({
      key,
      subject,
      path,
      body: html.replace(/<!--[\s\S]*?-->/g, '').trim(),
    })
  }
  return found
}

const templates = readTemplates()

describe('sign-in emails', () => {
  it('customises both of the templates that can reach a member', () => {
    // magic_link is every sign-in after the first. confirmation is the very
    // first email a new member gets whenever confirmations are enabled, which
    // is the default on a hosted project even though it is off locally.
    expect(templates.map((t) => t.key).sort()).toEqual(['confirmation', 'magic_link'])
  })

  for (const t of templates) {
    describe(t.key, () => {
      it('points at a file that exists and has a body', () => {
        expect(existsSync(t.path), `${t.path} is referenced from config.toml but missing`).toBe(
          true,
        )
        expect(t.body).not.toBe('')
      })

      it('keeps the six-digit code, the only way in from the iOS icon', () => {
        // A home-screen app has its own storage. A link requested there opens
        // in Safari and completes in the wrong place, and the PKCE verifier is
        // not in Safari either — so without the code there is no way through.
        expect(t.body).toContain('{{ .Token }}')
      })

      it('keeps the link, the fast path everywhere else', () => {
        expect(t.body).toContain('{{ .ConfirmationURL }}')
      })

      it('has no Supabase default left in it', () => {
        // `<h2>{{ .SiteURL }}</h2>` is the default template's heading, and it
        // renders a bare URL as the first thing anybody sees.
        expect(t.body).not.toMatch(/<h2>\s*\{\{\s*\.SiteURL\s*\}\}\s*<\/h2>/)
        expect(t.body).not.toMatch(/Follow this link|Confirm your signup|Reset password/i)
      })

      it('does not name the association, in the body or the subject', () => {
        // The sender name says who it is from. Another campus association
        // forks this repo, and the body of an email is an awkward place to
        // find out that was missed.
        const forbidden = /comissi[oó] cultural|tecnocampus|la comi\b/i
        expect(forbidden.test(t.body), `${t.path} names the association`).toBe(false)
        expect(forbidden.test(t.subject), `the ${t.key} subject names the association`).toBe(false)
      })

      it('is written in Catalan, like the default locale', () => {
        expect(t.subject.trim()).not.toBe('')
        // Cheap but real: none of these words survive a translation to the
        // English defaults.
        expect(t.body).toMatch(/correu|codi|entra|confirma/i)
      })
    })
  }
})
