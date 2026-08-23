import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { fetchSchools, rankingKeys } from '@/features/ranking/api'
import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { ESCOLES, type Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Wordmark } from '@/ui/Logo/Logo'

import { looksLikePhone, saveFirstRun } from './api'

/**
 * The four questions asked once, right after the door.
 *
 * Only the school is required, and it is required because points go to a
 * school: somebody without one is missing from half of what the app is for.
 * The rest is useful and can wait, which is why the last line says so.
 *
 * The school cards carry live numbers — how many members, what position — so
 * the choice reads as joining a side rather than filling in a form.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const COURSES = [1, 2, 3, 4] as const

export function OnboardingScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useUserId()
  const client = useQueryClient()
  const { data: profile } = useMyProfile()
  const grauId = useId()
  const phoneId = useId()

  const [escola, setEscola] = useState<Escola | null>(null)
  const [grau, setGrau] = useState('')
  const [curs, setCurs] = useState<number | null>(null)
  const [phone, setPhone] = useState('')

  // Only to put a number under each school. The board is already cached by the
  // home screen, so on the ordinary path this costs nothing.
  const bounds = { from: null, to: null }
  const schools = useQuery({
    queryKey: rankingKeys.schools(bounds),
    queryFn: () => fetchSchools(bounds),
  })

  const save = useMutation({
    mutationFn: () => {
      if (escola === null) throw new Error('no school chosen')
      return saveFirstRun(userId, {
        escola,
        grau: grau.trim() === '' ? null : grau.trim(),
        curs,
        telefon: phone.trim() === '' ? null : phone.trim(),
      })
    },
    onSuccess: async () => {
      await client.invalidateQueries()
      void navigate('/', { replace: true })
    },
  })

  const phoneOk = phone.trim() === '' || looksLikePhone(phone)
  const ready = escola !== null && phoneOk

  return (
    <main className="min-h-dvh bg-app pt-[var(--ds-safe-top)] pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
      <header className={`flex items-center justify-between gap-3 pt-4 pb-2 ${GUTTER}`}>
        <Wordmark size={20} />
      </header>

      <div className={`pt-2 ${GUTTER}`}>
        <h1 className="font-display text-d-lg leading-[0.87] tracking-[-0.05em] uppercase">
          {t('onboarding.title')}
        </h1>
        <p className="mt-4 text-lg text-fg-secondary [text-wrap:pretty]">{t('onboarding.lede')}</p>
      </div>

      {/* What Google already told us, shown rather than asked for again. */}
      <section className={`mt-[22px] flex items-center gap-3 ${GUTTER}`}>
        <Avatar src={profile?.avatar_url ?? null} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold">{profile?.nombre ?? ''}</p>
          <p className="mt-[2px] text-sm text-fg-muted [text-wrap:pretty]">
            {t('onboarding.nameHint')}
          </p>
        </div>
      </section>

      <section className={`mt-[26px] ${GUTTER}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase">
            {t('onboarding.school.label')}
          </h2>
          <span className="text-[11.5px] font-bold tracking-[0.1em] text-brand-label uppercase">
            {t('onboarding.school.required')}
          </span>
        </div>
        <p className="mt-[6px] text-sm text-fg-muted [text-wrap:pretty]">
          {t('onboarding.school.lede')}
        </p>

        <div className="mt-[14px] flex flex-col gap-[9px]">
          {ESCOLES.map((code) => {
            const row = schools.data?.find((s) => s.escola === code)
            const on = escola === code
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setEscola(code)
                }}
                className={
                  'flex w-full items-center gap-[14px] px-4 py-[15px] text-left ' +
                  (on
                    ? 'bg-brand-cta text-on-brand shadow-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg')
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="display block text-[19px] leading-[1.02] tracking-[-0.04em] [text-wrap:balance]">
                    {t(`escola.${code}`)}
                  </span>
                  <span
                    className={
                      'mt-[5px] block text-[12.5px] font-semibold ' +
                      (on ? 'text-on-brand' : 'text-[var(--ds-text-muted-lo)]')
                    }
                  >
                    {row
                      ? t('onboarding.school.stats', {
                          members: row.membres,
                          position: row.posicio,
                          points: row.punts_totals,
                        })
                      : t('onboarding.school.noStats')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={
                    'grid size-[26px] flex-none place-items-center rounded-full text-md font-extrabold ' +
                    (on ? 'bg-on-brand text-brand' : 'border-[1.5px] border-[var(--ds-surface-9)]')
                  }
                >
                  {on ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className={`mt-[26px] ${GUTTER}`}>
        <label
          htmlFor={grauId}
          className="block text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase"
        >
          {t('onboarding.degree.label')}
        </label>
        <input
          id={grauId}
          value={grau}
          onChange={(e) => {
            setGrau(e.target.value)
          }}
          autoComplete="off"
          enterKeyHint="next"
          placeholder={t('onboarding.degree.placeholder')}
          className={
            'mt-4 min-h-[50px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-[14px] ' +
            'py-[13px] text-lg font-semibold text-fg outline-none ' +
            'caret-[var(--ds-brand-strong)] placeholder:font-medium placeholder:text-fg-faint'
          }
        />
      </section>

      <section className={`mt-9 ${GUTTER}`}>
        <h2 className="text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase">
          {t('onboarding.year.label')}
        </h2>
        <div className="mt-4 flex gap-4" role="group" aria-label={t('onboarding.year.label')}>
          {COURSES.map((n) => {
            const on = curs === n
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCurs(on ? null : n)
                }}
                className={
                  'flex min-h-[50px] flex-1 items-center justify-center text-xl font-bold ' +
                  (on
                    ? 'bg-brand-cta text-on-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                }
              >
                {t(`onboarding.year.${String(n)}`)}
              </button>
            )
          })}
        </div>
      </section>

      <section className={`mt-9 ${GUTTER}`}>
        <label
          htmlFor={phoneId}
          className="block text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase"
        >
          {t('onboarding.phone.label')}
        </label>
        <div
          className={
            'mt-4 flex min-h-[50px] items-center gap-[10px] border-[1.5px] bg-surface-1 px-[14px] py-[13px] ' +
            (phoneOk ? 'border-surface-7' : 'border-warning')
          }
        >
          <span aria-hidden="true" className="flex-none text-lg font-semibold text-fg-faint">
            {t('onboarding.phone.prefix')}
          </span>
          <input
            id={phoneId}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
            }}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            enterKeyHint="done"
            placeholder={t('onboarding.phone.placeholder')}
            className={
              'w-full flex-1 border-0 bg-transparent p-0 text-lg font-semibold tracking-[0.02em] ' +
              'text-fg outline-none caret-[var(--ds-brand-strong)] placeholder:font-medium ' +
              'placeholder:text-fg-faint'
            }
          />
        </div>
        <p className="mt-4 text-[12.5px] font-medium text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {phoneOk ? t('onboarding.phone.why') : t('onboarding.phone.invalid')}
        </p>
      </section>

      <section className={`mt-[26px] pb-4 ${GUTTER}`}>
        <button
          type="button"
          disabled={!ready || save.isPending}
          onClick={() => {
            save.mutate()
          }}
          className={
            'flex min-h-[60px] w-full items-center justify-center p-4 text-center ' +
            'text-2xl font-bold [text-wrap:balance] ' +
            (ready
              ? 'bg-brand-cta text-on-brand shadow-brand'
              : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-muted')
          }
        >
          {save.isPending
            ? t('state.updating')
            : ready
              ? t('onboarding.cta.ready')
              : t('onboarding.cta.pickSchool')}
        </button>

        {save.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
            {t('errors.generic')}
          </p>
        ) : null}

        <p className="mt-[11px] text-center text-sm font-medium text-fg-dim [text-wrap:pretty]">
          {t('onboarding.later')}
        </p>
      </section>
    </main>
  )
}
