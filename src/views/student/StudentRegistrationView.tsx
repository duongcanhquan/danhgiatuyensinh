import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, MapPin, Phone, Send } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { StaffLoginCornerGate } from '../../components/StaffLoginCornerGate'
import { isFirebaseConfigured } from '../../services/firebase'
import {
  fetchPublicRegistrationMeta,
  submitPublicRegistration,
  type PublicRegistrationMeta,
} from '../../services/publicRegistration'
import {
  emptyPublicRegistrationForm,
  formatDobInput,
  formatVnPhoneInput,
  describePublicDobIssue,
  PUBLIC_REG_INPUT_CLS,
  resolveAcademicPerformance,
  resolvePublicRegistrationPhones,
  validatePublicRegistrationForm,
} from '../../utils/publicRegistrationForm'
import {
  publicRegText,
  SCORE_PRESETS,
  type PublicRegLang,
} from '../../utils/publicRegistrationI18n'
import {
  applicantCategoryOptionsFromEntries,
  type ApplicantCategoryOption,
} from '../../utils/applicantCategoryCatalog'
import { normalizeOrgSlug } from '../../tenancy/orgConstants'

function eduLabelHint(label: string, lang: PublicRegLang): string {
  if (lang === 'en') {
    if (label.includes('Cao đẳng chính quy')) return 'Regular College (2 years 4 months)'
    if (label.includes('Phổ thông') || label.includes('9+')) return 'High School College (9+)'
    if (label.includes('Liên thông')) return 'Inter-level College Transfer'
  }
  return label
}

export function StudentRegistrationView() {
  const navigate = useNavigate()
  const { orgSlug: orgSlugParam } = useParams<{ orgSlug?: string }>()
  const orgSlug = useMemo(() => normalizeOrgSlug(orgSlugParam), [orgSlugParam])
  const [lang, setLang] = useState<PublicRegLang>('vn')
  const [meta, setMeta] = useState<PublicRegistrationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPublicRegistrationForm)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const prev = document.title
    document.title = 'VIETMY COLLEGE'
    const desc = 'Cổng đăng ký tuyển sinh của Trường Cao đẳng Việt Mỹ Hà Nội.'
    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      el.content = content
    }
    upsertMeta('name', 'description', desc)
    upsertMeta('property', 'og:title', 'VIETMY COLLEGE')
    upsertMeta('property', 'og:description', desc)
    return () => {
      document.title = prev
    }
  }, [])
  const [portalClosed, setPortalClosed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const t = useCallback((key: Parameters<typeof publicRegText>[1]) => publicRegText(lang, key), [lang])

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false)
      setLoadFailed(true)
      return
    }
    let cancelled = false
    void fetchPublicRegistrationMeta(orgSlug)
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        setLoadFailed(false)
        setPortalClosed(!m.enabled)
        setError(null)
      })
      .catch(() => {
        if (cancelled) return
        setLoadFailed(true)
        setPortalClosed(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgSlug])

  const bannerError = !isFirebaseConfigured()
    ? t('firebaseMissing')
    : loadFailed
      ? t('loadFailed')
      : portalClosed
        ? t('closed')
        : error

  const patch = useCallback((partial: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...partial }))
  }, [])

  const selectedProgram = useMemo(() => {
    const label = (form.studyIntention || form.educationLevel).trim()
    return meta?.trainingPrograms.find((p) => p.label === label || p.id === label) ?? null
  }, [form.studyIntention, form.educationLevel, meta?.trainingPrograms])

  const majorOptions = useMemo(() => {
    const list = meta?.majors ?? []
    if (!selectedProgram) return []
    return list.filter(
      (m) => !m.departmentId || m.departmentId === selectedProgram.id,
    )
  }, [meta?.majors, selectedProgram])

  const applicantCategoryOptions = useMemo((): ApplicantCategoryOption[] => {
    const fromMeta = (meta?.applicantCategories ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      labelEn: c.labelEn,
      isActive: true as const,
    }))
    return applicantCategoryOptionsFromEntries(fromMeta)
  }, [meta?.applicantCategories])

  useEffect(() => {
    if (!applicantCategoryOptions.length) return
    if (applicantCategoryOptions.some((c) => c.value === form.applicantCategory)) return
    patch({ applicantCategory: applicantCategoryOptions[0]!.value })
  }, [applicantCategoryOptions, form.applicantCategory, patch])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErr = validatePublicRegistrationForm(form, lang, {
      trainingProgramLabels: (meta?.trainingPrograms ?? []).map((p) => p.label),
      majorLabels: majorOptions.map((m) => m.label),
      counselorIds: (meta?.counselors ?? []).map((c) => c.id),
      applicantCategoryLabels: applicantCategoryOptions.map((c) => c.value),
    })
    if (validationErr) {
      setError(validationErr)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const academicPerformance = resolveAcademicPerformance(form)
      const study = (form.studyIntention || form.educationLevel).trim()
      const phones = resolvePublicRegistrationPhones(form)
      const result = await submitPublicRegistration({
        orgSlug,
        fullName: form.fullName.trim().toUpperCase(),
        phone: phones.phone,
        studentEmail: form.studentEmail.trim(),
        dateOfBirth: form.dateOfBirth.trim(),
        gender: form.gender,
        placeOfBirth: form.placeOfBirth.trim(),
        ethnicity: form.ethnicity.trim(),
        nationalId: form.nationalIdNotAvailable ? 'CHƯA CÓ' : form.nationalId.trim().toUpperCase(),
        nationalIdNotAvailable: form.nationalIdNotAvailable,
        permanentAddress: form.permanentAddress.trim(),
        address: form.permanentAddress.trim(),
        fatherName: form.fatherName.trim().toUpperCase(),
        fatherPhone: phones.fatherPhone,
        motherName: form.motherName.trim().toUpperCase(),
        motherPhone: phones.motherPhone,
        parentPhone: phones.parentPhone,
        highSchool: form.highSchool.trim(),
        schoolProvince: form.schoolProvince.trim(),
        province: form.schoolProvince.trim(),
        applicantCategory: form.applicantCategory,
        educationLevel: study,
        studyIntention: study,
        majorInterest: form.majorInterest.trim(),
        academicPerformance,
        counselorId: form.counselorId,
        description: form.description?.trim() || '',
      })
      navigate('/dang-ky/thanh-cong', {
        replace: true,
        state: {
          systemCode: result.systemCode,
          successMessage: result.successMessage,
          counselorName: result.counselorName,
          n8nOk: result.n8nOk,
          lang,
        },
      })
    } catch (err) {
      let msg = t('submitFailed')
      const firebaseErr =
        err instanceof FirebaseError
          ? err
          : err instanceof Error && err.cause instanceof FirebaseError
            ? err.cause
            : null
      const serverMsg = (err instanceof Error ? err.message : '') || firebaseErr?.message || ''
      if (firebaseErr?.code === 'functions/already-exists') {
        const isNid =
          /CCCD|Passport|national.?id|mã định danh/i.test(serverMsg)
        msg = isNid ? t('dupNationalId') : t('dupPhone')
      } else if (lang === 'vn' && err instanceof Error && err.message) {
        msg = err.message
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const rawLogo = meta?.logoUrl || '/brand/logo-vietmy-xanh.png'
  const logoSrc = rawLogo.includes('logo-vietmy-trang') ? '/brand/logo-vietmy-xanh.png' : rawLogo
  const contactPhoneDisplay = meta?.contactPhone || '0982.856.648'
  const contactPhoneTel = contactPhoneDisplay.replace(/\D/g, '')

  return (
    <div className="public-reg-portal min-h-screen bg-[length:400%_400%] px-3 py-4 text-slate-800 sm:px-4 sm:py-6 md:py-8"
      style={{
        backgroundImage: 'linear-gradient(-45deg, #f5f7fa, #c3cfe2, #e0c3fc, #8ec5fc)',
        animation: 'publicRegGradient 15s ease infinite',
      }}
    >
      <style>{`@keyframes publicRegGradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>

      <div className="mx-auto w-full max-w-[900px]">
        <div className="relative rounded-3xl border border-white/40 bg-white/85 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.08)] backdrop-blur-md sm:p-8 md:p-10">
          <div className="absolute right-3 top-3 z-10 sm:right-5 sm:top-5">
            <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm" role="group" aria-label="Language">
              <button
                type="button"
                onClick={() => setLang('vn')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-bold ${lang === 'vn' ? 'bg-[#0056b3] text-white' : 'text-slate-500'}`}
              >
                VN
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-bold ${lang === 'en' ? 'bg-[#0056b3] text-white' : 'text-slate-500'}`}
              >
                EN
              </button>
            </div>
          </div>

          <header className="mb-4 pt-5 text-center sm:mb-5 sm:pt-1">
            <img
              src={logoSrc}
              alt={t('logoAlt')}
              className="mx-auto mb-2 h-auto max-w-[110px] sm:max-w-[130px]"
            />
            <h1 className="text-lg font-extrabold uppercase tracking-tight text-[#0056b3] sm:text-xl">
              {lang === 'vn' && meta?.portalTitle?.trim() ? meta.portalTitle.trim() : t('portalTitle')}
            </h1>
            <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
              {lang === 'vn' && meta?.introText?.trim() ? meta.introText.trim() : t('portalSub')}
            </p>
            <div className="mt-3 inline-block rounded-xl border border-[#0056b3]/15 bg-white/60 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 sm:text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                <span>
                  <span className="text-slate-500">{t('addressLabel')}: </span>
                  {lang === 'vn'
                    ? meta?.contactAddress || t('contactAddress')
                    : t('contactAddress')}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="text-slate-500">{t('phoneLabel')}: </span>
                {contactPhoneTel ? (
                  <a
                    href={`tel:${contactPhoneTel}`}
                    className="text-[#0056b3] underline-offset-2 hover:underline"
                  >
                    {contactPhoneDisplay}
                  </a>
                ) : (
                  <span>{contactPhoneDisplay}</span>
                )}
              </p>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {t('loading')}
            </div>
          ) : meta?.enabled ? (
            <>
              {bannerError ? (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
                  {bannerError}
                </div>
              ) : null}

              <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#0056b3]">
                    {t('section1')}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-12 sm:gap-4">
                    <label className="sm:col-span-6">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('fullName')}</span>
                      <input
                        className={`${PUBLIC_REG_INPUT_CLS} uppercase`}
                        value={form.fullName}
                        onChange={(e) => patch({ fullName: e.target.value.toUpperCase() })}
                        placeholder={t('phName')}
                        required
                        autoComplete="name"
                      />
                    </label>
                    <label className="sm:col-span-3">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('dob')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.dateOfBirth}
                        onChange={(e) => patch({ dateOfBirth: formatDobInput(e.target.value) })}
                        placeholder={t('phDob')}
                        maxLength={10}
                        required
                        inputMode="numeric"
                      />
                      {(() => {
                        const dobIssue =
                          form.dateOfBirth.trim().length >= 10
                            ? describePublicDobIssue(form.dateOfBirth)
                            : null
                        return dobIssue ? (
                          <p className="mt-1 text-[11px] font-medium text-rose-700">{dobIssue}</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-500">VD: 25021984 → 25/02/1984</p>
                        )
                      })()}
                    </label>
                    <label className="sm:col-span-3">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('gender')}</span>
                      <select
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.gender}
                        onChange={(e) => patch({ gender: e.target.value })}
                      >
                        <option value="Nam">{t('male')}</option>
                        <option value="Nữ">{t('female')}</option>
                      </select>
                    </label>
                    <label className="sm:col-span-4">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('pob')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.placeOfBirth}
                        onChange={(e) => patch({ placeOfBirth: e.target.value })}
                        placeholder={t('phPob')}
                        required
                      />
                    </label>
                    <label className="sm:col-span-4">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('ethnicity')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.ethnicity}
                        onChange={(e) => patch({ ethnicity: e.target.value })}
                        placeholder={t('phEthnicity')}
                        required
                      />
                    </label>
                    <div className="sm:col-span-4">
                      <label>
                        <span className="mb-2 block text-xs font-semibold text-slate-600">{t('cccd')}</span>
                        <input
                          className={PUBLIC_REG_INPUT_CLS}
                          value={form.nationalId}
                          onChange={(e) => {
                            if (form.nationalIdNotAvailable) return
                            patch({
                              nationalId: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 15),
                            })
                          }}
                          placeholder={t('phCccd')}
                          maxLength={15}
                          readOnly={form.nationalIdNotAvailable}
                          required={!form.nationalIdNotAvailable}
                        />
                      </label>
                      <p className="mt-1 text-[11px] text-slate-500">CCCD: đúng 9 hoặc 12 số</p>
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-rose-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-rose-600"
                          checked={form.nationalIdNotAvailable}
                          onChange={(e) => {
                            const on = e.target.checked
                            patch({
                              nationalIdNotAvailable: on,
                              nationalId: on ? 'CHƯA CÓ' : '',
                            })
                          }}
                        />
                        {t('noCccd')}
                      </label>
                    </div>
                    <label className="sm:col-span-6">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('phone')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.phone}
                        onChange={(e) => patch({ phone: formatVnPhoneInput(e.target.value) })}
                        placeholder={t('phPhone')}
                        inputMode="numeric"
                        maxLength={10}
                        autoComplete="tel"
                      />
                    </label>
                    <label className="sm:col-span-6">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('email')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        type="email"
                        value={form.studentEmail}
                        onChange={(e) => patch({ studentEmail: e.target.value })}
                        placeholder={t('phEmail')}
                        required
                        autoComplete="email"
                      />
                    </label>
                    <label className="sm:col-span-12">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('address')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.permanentAddress}
                        onChange={(e) => patch({ permanentAddress: e.target.value })}
                        placeholder={t('phAddress')}
                        required
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-4 text-base font-bold text-[#0056b3]">{t('section2')}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('fatherName')}</span>
                      <input
                        className={`${PUBLIC_REG_INPUT_CLS} uppercase`}
                        value={form.fatherName}
                        onChange={(e) => patch({ fatherName: e.target.value.toUpperCase() })}
                        placeholder={t('phFatherName')}
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('fatherPhone')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.fatherPhone}
                        onChange={(e) => patch({ fatherPhone: formatVnPhoneInput(e.target.value) })}
                        placeholder={t('phPhone')}
                        inputMode="numeric"
                        maxLength={10}
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('motherName')}</span>
                      <input
                        className={`${PUBLIC_REG_INPUT_CLS} uppercase`}
                        value={form.motherName}
                        onChange={(e) => patch({ motherName: e.target.value.toUpperCase() })}
                        placeholder={t('phMotherName')}
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('motherPhone')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.motherPhone}
                        onChange={(e) => patch({ motherPhone: formatVnPhoneInput(e.target.value) })}
                        placeholder={t('phPhone')}
                        inputMode="numeric"
                        maxLength={10}
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-4 text-base font-bold text-[#0056b3]">{t('section3')}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('school')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.highSchool}
                        onChange={(e) => patch({ highSchool: e.target.value })}
                        placeholder={t('phSchool')}
                        required
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('schoolProvince')}</span>
                      <input
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.schoolProvince}
                        onChange={(e) => patch({ schoolProvince: e.target.value })}
                        placeholder={t('phSchoolProvince')}
                        required
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('situation')}</span>
                      <select
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.applicantCategory}
                        onChange={(e) => patch({ applicantCategory: e.target.value })}
                        required
                      >
                        {applicantCategoryOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {lang === 'en' ? c.labelEn : c.labelVn}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('eduSystem')}</span>
                      <select
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.studyIntention || form.educationLevel}
                        onChange={(e) => {
                          const v = e.target.value
                          patch({
                            studyIntention: v,
                            educationLevel: v,
                            majorInterest: '',
                          })
                        }}
                        required
                      >
                        <option value="">{t('pickEdu')}</option>
                        {(meta?.trainingPrograms ?? []).map((p) => (
                          <option key={p.id} value={p.label}>
                            {eduLabelHint(p.label, lang)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('major')}</span>
                      <select
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.majorInterest}
                        onChange={(e) => patch({ majorInterest: e.target.value })}
                        required
                        disabled={!selectedProgram}
                      >
                        <option value="">
                          {selectedProgram ? t('pickMajor') : t('pickEduFirst')}
                        </option>
                        {majorOptions.map((m) => (
                          <option key={m.id} value={m.label}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">{t('counselor')}</span>
                      <select
                        className={PUBLIC_REG_INPUT_CLS}
                        value={form.counselorId}
                        onChange={(e) => patch({ counselorId: e.target.value })}
                        required
                      >
                        <option value="">{t('pickCounselor')}</option>
                        {(meta?.counselors ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                            {c.role === 'team_lead'
                              ? ' — Trưởng nhóm'
                              : c.role === 'admin'
                                ? ' — Quản lý'
                                : ''}
                          </option>
                        ))}
                      </select>
                      {!meta?.counselors?.length ? (
                        <span className="mt-1 block text-[11px] text-amber-800">{t('noCounselors')}</span>
                      ) : null}
                    </label>
                    <div className="sm:col-span-2">
                      <label>
                        <span className="mb-2 block text-xs font-semibold text-slate-600">{t('score')}</span>
                        <select
                          className={`${PUBLIC_REG_INPUT_CLS} mb-2`}
                          value={form.scorePreset}
                          onChange={(e) => patch({ scorePreset: e.target.value })}
                        >
                          {SCORE_PRESETS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {lang === 'en' ? s.en : s.vn}
                            </option>
                          ))}
                        </select>
                      </label>
                      {form.scorePreset === 'Khác' ? (
                        <input
                          className={PUBLIC_REG_INPUT_CLS}
                          value={form.customScore}
                          onChange={(e) => patch({ customScore: e.target.value })}
                          placeholder={t('scorePh')}
                          required
                        />
                      ) : null}
                    </div>
                  </div>
                </section>

                <button
                  type="submit"
                  disabled={busy || !(meta?.counselors?.length)}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#0056b3] to-[#007bff] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
                  {busy ? t('submitting') : t('submit')}
                </button>

                <div className="rounded-xl border-l-4 border-[#ff4d4d] bg-[#fff5f5] px-4 py-3 text-xs leading-relaxed text-[#c0392b] sm:text-sm">
                  <strong>{t('noteTitle')}</strong> {t('noteBody')}
                </div>
              </form>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm text-amber-950">
              <p>{bannerError ?? t('closed')}</p>
            </div>
          )}
        </div>
      </div>
      <StaffLoginCornerGate />
    </div>
  )
}
