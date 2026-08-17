import { describe, expect, it } from 'vitest'
import {
  buildPortalAssignmentPatch,
  buildPortalStudentFieldPatch,
  canAccessPortalRegistrationControl,
  canResolvePortalRegistration,
  existingLeadPhoneIsThin,
  fullNameQueryVariants,
  leadActivityWarningFromRecord,
  leadHasCounselorActivity,
  portalCompareKind,
  portalCompareKindLabel,
  portalCompareRows,
  portalNameMatchScore,
  portalPayloadFieldValue,
  portalRegistrationIsOpen,
  portalResolveLockActive,
  resolveAllowedMergeLeadId,
  resolvePortalMatchKind,
  shouldApplyPortalUniqueHash,
  shouldQueueNameHit,
  strongPortalMatch,
} from './portalRegistrationControl'

describe('portalRegistrationControl', () => {
  it('gates Kiểm soát đăng ký to admin, field staff, and team lead as TVV B', () => {
    expect(canAccessPortalRegistrationControl('super_admin')).toBe(true)
    expect(canAccessPortalRegistrationControl('admin')).toBe(true)
    expect(canAccessPortalRegistrationControl('counselor')).toBe(true)
    expect(canAccessPortalRegistrationControl('ctv')).toBe(true)
    expect(canAccessPortalRegistrationControl('team_lead')).toBe(true)
    expect(canAccessPortalRegistrationControl('marketing')).toBe(false)
    expect(canAccessPortalRegistrationControl('accountant')).toBe(false)
  })

  it('lets TVV B resolve only their portal counselor id', () => {
    expect(canResolvePortalRegistration('admin', 'a1', 'b2')).toBe(true)
    expect(canResolvePortalRegistration('counselor', 'b2', 'b2')).toBe(true)
    expect(canResolvePortalRegistration('counselor', 'b2', 'a1')).toBe(false)
    expect(canResolvePortalRegistration('team_lead', 't1', 't1')).toBe(true)
    expect(canResolvePortalRegistration('team_lead', 't1', 'other')).toBe(false)
    expect(canResolvePortalRegistration('ctv', 'c1', 'c1')).toBe(true)
    expect(canResolvePortalRegistration('ctv', 'c1', 'other')).toBe(false)
    expect(canResolvePortalRegistration('marketing', 'b2', 'b2')).toBe(false)
  })

  it('treats import-only assignment as no activity', () => {
    expect(leadHasCounselorActivity({ assignedTo: 'tvvA', counselorStatus: 'NEW' })).toBe(false)
    expect(leadHasCounselorActivity({ pipelineStatus: 'QUALIFIED', counselorStatus: 'ENROLLED' })).toBe(false)
    expect(leadHasCounselorActivity({ lastCallAt: { seconds: 1_700_000_000 } })).toBe(true)
    expect(leadHasCounselorActivity({ lastInteractionKind: 'note', lastInteractionAt: { seconds: 1_700_000_000 } })).toBe(
      true,
    )
    expect(leadHasCounselorActivity({ lastInteractionKind: 'profile', lastInteractionAt: { seconds: 1_700_000_000 } })).toBe(
      false,
    )
    expect(leadHasCounselorActivity({ callWorkBucket: 'uncalled' })).toBe(false)
    expect(leadHasCounselorActivity({ callWorkBucket: 'called' })).toBe(true)
  })

  it('warns when previous counselor already called', () => {
    const line = leadActivityWarningFromRecord(
      { lastCallAt: { seconds: 1_700_000_000 }, lastCallOutcome: 'CONNECTED' },
      'Nguyễn A',
    )
    expect(line).toMatch(/Nguyễn A/)
    expect(line).toMatch(/đã gọi/)
  })

  it('fills student fields without touching finance or pipeline', () => {
    const patch = buildPortalStudentFieldPatch(
      {
        fullName: 'NGUYEN VAN A',
        phone: '0900000001',
        description: 'Import lớp 12A1',
        finance: { enrollmentStatus: 'Đã cọc' },
        pipelineStatus: 'QUALIFIED',
      },
      {
        fullName: 'nguyen van a',
        studentPhoneRaw: '0912345678',
        phone: '0988000000',
        nationalId: '001234567890',
        permanentAddress: 'Hà Nội',
        majorInterest: 'CNTT',
        description: 'Đăng ký cổng',
      },
    )
    expect(patch.fullName).toBe('NGUYEN VAN A')
    expect(patch.phone).toBe('0912345678')
    expect(patch.nationalId).toBe('001234567890')
    expect(patch.permanentAddress).toBe('Hà Nội')
    expect(patch.majorInterest).toBe('CNTT')
    expect(patch.description).toContain('Import lớp 12A1')
    expect(patch.description).toContain('Đăng ký cổng')
    expect(patch.finance).toBeUndefined()
    expect(patch.pipelineStatus).toBeUndefined()
  })

  it('does not wipe CCCD when portal ticks chưa có', () => {
    const patch = buildPortalStudentFieldPatch(
      { nationalId: '012345678901', phone: '0900000001' },
      { nationalIdNotAvailable: true, nationalId: 'CHƯA CÓ' },
    )
    expect(patch.nationalId).toBeUndefined()
    expect(patch.nationalIdNotAvailable).toBeUndefined()
  })

  it('does not replace existing student phone with parent fallback', () => {
    const patch = buildPortalStudentFieldPatch(
      { phone: '0901111111' },
      { phone: '0988222222', studentPhoneRaw: '' },
    )
    expect(patch.phone).toBeUndefined()
  })

  it('fills phone from parent only when live lead has no phone', () => {
    const patch = buildPortalStudentFieldPatch({ phone: '' }, { phone: '0988222222' })
    expect(patch.phone).toBe('0988222222')
  })

  it('assigns to portal counselor and remembers previous assignee', () => {
    expect(buildPortalAssignmentPatch({ assignedTo: 'tvvA' }, 'tvvB')).toEqual({
      assignedTo: 'tvvB',
      assignedCounselorId: 'tvvB',
      previousAssigneeId: 'tvvA',
    })
    expect(buildPortalAssignmentPatch({ assignedTo: 'tvvB' }, 'tvvB').previousAssigneeId).toBeUndefined()
    expect(buildPortalAssignmentPatch({ assignedCounselorId: 'tvvA' }, 'tvvB').previousAssigneeId).toBe('tvvA')
  })

  it('scores name matches by class and school', () => {
    const existing = { fullName: 'NGUYEN VAN A', gradeClass: '12A1', highSchool: 'THPT ABC' }
    expect(portalNameMatchScore(existing, { fullName: 'nguyen van a', gradeClass: '12A1' })).toBeGreaterThan(
      portalNameMatchScore(existing, { fullName: 'nguyen van a' }),
    )
    expect(portalNameMatchScore(existing, { fullName: 'TRAN VAN B' })).toBe(0)
  })

  it('queues thin name hits but skips homonyms that already have a phone', () => {
    expect(existingLeadPhoneIsThin('')).toBe(true)
    expect(existingLeadPhoneIsThin('0912345678')).toBe(false)
    expect(
      shouldQueueNameHit({ fullName: 'NGUYEN VAN A', phone: '' }, { fullName: 'nguyen van a', highSchool: 'THPT X' }),
    ).toBe(true)
    expect(
      shouldQueueNameHit(
        { fullName: 'NGUYEN VAN A', phone: '0912345678', highSchool: 'THPT ABC' },
        { fullName: 'nguyen van a', highSchool: 'THPT ABC' },
      ),
    ).toBe(true)
    expect(
      shouldQueueNameHit(
        { fullName: 'NGUYEN VAN A', phone: '0912345678', highSchool: 'THPT ABC' },
        { fullName: 'nguyen van a', highSchool: 'THPT KHAC' },
      ),
    ).toBe(false)
  })

  it('queries both typed and uppercase full names', () => {
    expect(fullNameQueryVariants('Nguyễn Văn A')).toEqual(['Nguyễn Văn A', 'NGUYỄN VĂN A'])
    expect(fullNameQueryVariants('AB')).toEqual([])
  })

  it('restricts merge targets to suggested ids', () => {
    expect(resolveAllowedMergeLeadId('phone', 'L1', ['L1', 'L2'], 'L2')).toBe('L1')
    expect(resolveAllowedMergeLeadId('name', 'L1', ['L1', 'L2'], 'L2')).toBe('L2')
    expect(resolveAllowedMergeLeadId('name', 'L1', ['L1', 'L2'], 'HACK')).toBe('L1')
    expect(resolveAllowedMergeLeadId('national_id', '', [], 'L9')).toBeNull()
  })

  it('prefers CCCD then phone then name', () => {
    expect(resolvePortalMatchKind({ nationalIdHit: true, phoneHit: true, nameHits: 2 })).toBe('national_id')
    expect(resolvePortalMatchKind({ nationalIdHit: false, phoneHit: true, nameHits: 2 })).toBe('phone')
    expect(resolvePortalMatchKind({ nationalIdHit: false, phoneHit: false, nameHits: 1 })).toBe('name')
    expect(resolvePortalMatchKind({ nationalIdHit: false, phoneHit: false, nameHits: 0 })).toBe('none')
    expect(strongPortalMatch('phone')).toBe(true)
    expect(strongPortalMatch('name')).toBe(false)
  })

  it('does not put finance, pipeline, counselor status, or systemCode into the merge patch', () => {
    const patch = buildPortalStudentFieldPatch(
      {
        finance: { enrollmentStatus: 'Đã cọc' },
        pipelineStatus: 'QUALIFIED',
        counselorStatus: 'ENROLLED',
        systemCode: '2608170001',
        lastCallAt: { seconds: 1_700_000_000 },
      },
      {
        fullName: 'TRAN VAN B',
        finance: { enrollmentStatus: 'Chưa cọc' },
        pipelineStatus: 'NEW',
        counselorStatus: 'NEW',
        systemCode: 'HACK',
      },
    )
    expect(patch.finance).toBeUndefined()
    expect(patch.pipelineStatus).toBeUndefined()
    expect(patch.counselorStatus).toBeUndefined()
    expect(patch.systemCode).toBeUndefined()
    expect(patch.lastCallAt).toBeUndefined()
    expect(patch.fullName).toBe('TRAN VAN B')
  })

  it('keeps existing CCCD when portal sends lowercase chưa có', () => {
    const patch = buildPortalStudentFieldPatch(
      { nationalId: '012345678901' },
      { nationalId: 'chưa có', nationalIdNotAvailable: true },
    )
    expect(patch.nationalId).toBeUndefined()
  })

  it('queues same name + dob even when the live lead already has a phone', () => {
    expect(
      shouldQueueNameHit(
        { fullName: 'NGUYEN VAN A', phone: '0912345678', dateOfBirth: '01/01/2007' },
        { fullName: 'nguyen van a', dateOfBirth: '01/01/2007' },
      ),
    ).toBe(true)
  })

  it('folds school accents when scoring name hits', () => {
    expect(
      portalNameMatchScore(
        { fullName: 'NGUYỄN VĂN A', highSchool: 'THPT Nguyễn Du' },
        { fullName: 'nguyễn văn a', highSchool: 'THPT Nguyen Du' },
      ),
    ).toBeGreaterThanOrEqual(3)
  })

  it('does not treat accent-stripped names as the same person', () => {
    expect(
      portalNameMatchScore(
        { fullName: 'NGUYỄN VĂN A' },
        { fullName: 'NGUYEN VAN A' },
      ),
    ).toBe(0)
  })

  it('treats 9-digit phones missing the leading 0 as not thin', () => {
    expect(existingLeadPhoneIsThin('912345678')).toBe(false)
    expect(existingLeadPhoneIsThin('+84912345678')).toBe(false)
    expect(existingLeadPhoneIsThin('0901')).toBe(true)
  })

  it('applies portal uniqueHash only for student phone or thin live leads', () => {
    expect(
      shouldApplyPortalUniqueHash({ phone: '0901111111' }, { studentPhoneRaw: '0912345678' }),
    ).toBe(true)
    expect(
      shouldApplyPortalUniqueHash({ phone: '0901111111' }, { studentPhoneRaw: '', phone: '0988000000' }),
    ).toBe(false)
    expect(
      shouldApplyPortalUniqueHash({ phone: '' }, { studentPhoneRaw: '', phone: '0988000000' }),
    ).toBe(true)
  })

  it('reclaims a stale resolving lock and holds a fresh one', () => {
    const now = 1_000_000
    expect(portalRegistrationIsOpen('pending_review', null, now)).toBe(true)
    expect(portalRegistrationIsOpen('merged', now, now)).toBe(false)
    expect(portalResolveLockActive('resolving', now - 10_000, now)).toBe(true)
    expect(portalRegistrationIsOpen('resolving', now - 10_000, now)).toBe(false)
    expect(portalRegistrationIsOpen('resolving', now - 3 * 60 * 1000, now)).toBe(true)
    expect(portalRegistrationIsOpen('resolving', null, now)).toBe(true)
  })

  it('builds field-by-field portal vs system compare rows and flags diffs', () => {
    const rows = portalCompareRows(
      {
        fullName: 'NGUYEN VAN A',
        studentPhoneRaw: '0911111111',
        highSchool: 'THPT ABC',
        nationalId: '001234567890',
        majorInterest: 'CNTT',
      },
      {
        fullName: 'NGUYEN VAN A',
        phone: '0922222222',
        highSchool: 'THPT ABC',
        nationalId: '001234567890',
      },
    )
    const phone = rows.find((r) => r.key === 'phone')
    const school = rows.find((r) => r.key === 'highSchool')
    const major = rows.find((r) => r.key === 'majorInterest')
    expect(phone?.portal).toBe('0911111111')
    expect(phone?.system).toBe('0922222222')
    expect(phone?.kind).toBe('diff')
    expect(school?.kind).toBe('same')
    expect(major?.kind).toBe('added')
    expect(rows[0]?.kind).toBe('diff')
    expect(portalCompareKind('a', '')).toBe('added')
    expect(portalCompareKind('', 'b')).toBe('system_only')
    expect(portalCompareKindLabel('added')).toBe('Thêm mới')
    expect(portalPayloadFieldValue({ nationalIdNotAvailable: true, nationalId: 'CHƯA CÓ' }, 'nationalId')).toBe(
      'CHƯA CÓ',
    )
  })
})
