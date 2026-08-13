import { Link, useLocation, Navigate } from 'react-router-dom'
import { StaffLoginCornerGate } from '../../components/StaffLoginCornerGate'
import { CheckCircle2, Copy, GraduationCap } from 'lucide-react'
import { useState } from 'react'
import { publicRegText, type PublicRegLang } from '../../utils/publicRegistrationI18n'

type SuccessState = {
  systemCode: string
  successMessage: string
  counselorName: string | null
  n8nOk?: boolean
  lang?: PublicRegLang
}

export function StudentRegistrationSuccessView() {
  const location = useLocation()
  const state = location.state as SuccessState | null
  const [copied, setCopied] = useState(false)

  if (!state?.systemCode) {
    return <Navigate to="/dang-ky" replace />
  }

  const lang: PublicRegLang = state.lang === 'en' ? 'en' : 'vn'
  const t = (key: Parameters<typeof publicRegText>[1]) => publicRegText(lang, key)
  const successBody =
    lang === 'en'
      ? t('successDefault')
      : state.successMessage?.trim() || t('successDefault')

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.systemCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50">
      <header className="border-b border-emerald-100/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t('brandShort')}</p>
            <h1 className="text-base font-extrabold text-slate-900 sm:text-lg">{t('successTitle')}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">{successBody}</p>

          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('yourCode')}</p>
            <p className="mt-1 font-mono text-2xl font-extrabold tracking-wide text-emerald-800">{state.systemCode}</p>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? t('copied') : t('copyCode')}
            </button>
          </div>

          {state.counselorName ? (
            <p className="mt-4 text-sm text-slate-600">
              {t('counselorAssigned')}: <strong>{state.counselorName}</strong>
            </p>
          ) : null}

          {state.n8nOk === false ? (
            <p className="mt-3 text-xs text-amber-800">{t('emailSlow')}</p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">{t('emailOk')}</p>
          )}

          <Link
            to="/dang-ky"
            className="mt-8 inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            {t('backToReg')}
          </Link>
        </div>
      </main>
      <StaffLoginCornerGate />
    </div>
  )
}
