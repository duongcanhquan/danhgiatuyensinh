# Gộp tạo tay vào Cổng đăng ký — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn Hồ sơ còn 2 nguồn nhập (chiến dịch | Cổng đăng ký); tab cổng gồm hồ sơ SV + tạo tay cũ; form Tạo mới ghi như cổng và bắt buộc đủ mục form SV.

**Architecture:** Thêm khớp nhóm tab (`campaign_upload` vs cổng = `manual` ∪ `public_portal`) và filter Firestore `or(uploadedBy==public_portal, intakeOrigin in [manual, public_portal])`. Tạo mới ghi `intakeOrigin`/`registrationChannel` = `public_portal`, giữ `uploadedBy` = UID nhân viên. Validation tạo mới tái sử dụng rule cổng (dob/SĐT/email/CCCD).

**Tech Stack:** React 19, TypeScript, Vitest, Firestore (`or`/`in` đã dùng trong `useLeads`).

**Spec:** `docs/superpowers/specs/2026-08-14-intake-portal-merge-design.md`

## Global Constraints

- Không backfill Firestore (`manual` cũ giữ nguyên field).
- Không đổi form công khai `/dang-ky`.
- Không đổi tab chiến dịch / Excel / giấy mời khi tạo mới.
- Không nhãn «TVV tạo» / «SV gửi» trên bảng; cột Tư vấn viên giữ người phụ trách.
- Ô học lực khi tạo mới vẫn Yếu/TB/Khá/Giỏi (không đổi sang 8.0–9.0).
- Copy UI tiếng Việt đời thường (không hiện tên field Firestore).
- TDD: test fail → code → pass; commit sau mỗi task xanh.

## File map

| File | Responsibility |
|------|----------------|
| `src/utils/leadIntakeOrigin.ts` | Tab UI, URL `manual`→portal, `leadMatchesIntakeOriginTab` |
| `src/utils/leadIntakeOrigin.test.ts` | Unit origin/tab/URL |
| `src/hooks/useLeads.ts` | `portalIntakeGroup` → `or(...)` |
| `src/views/LeadManagement.tsx` | 2 nút, empty state, filter tab |
| `src/utils/manualLeadCreate.ts` | Validation cổng + ghi origin cổng |
| `src/utils/manualLeadCreate.test.ts` | Validation + origin fields |
| `src/components/CreateLeadModal.tsx` | Mặc định Nguồn 1 từ config cổng |
| `src/components/LeadProfileCoreForm.tsx` | Giới tính Nam/Nữ khi `isNewLead` |
| Specs | Status approved / note UI 3-tab superseded |

---

### Task 1: Origin tab group + URL

**Files:**
- Modify: `src/utils/leadIntakeOrigin.ts`
- Modify: `src/utils/leadIntakeOrigin.test.ts`

**Interfaces:**
- Produces: `LeadIntakeOriginTab`, `LEAD_INTAKE_ORIGIN_TABS`, `parseLeadIntakeOriginFromUrl('manual') → 'public_portal'`, `leadMatchesIntakeOriginTab(lead, tab)`
- Keeps: `LeadIntakeOrigin` gồm `manual`; `leadMatchesIntakeOrigin` exact (dùng tab chiến dịch)

- [ ] **Step 1: Write the failing test**

In `src/utils/leadIntakeOrigin.test.ts`, change URL mapping and add group tests:

```ts
import {
  leadIntakeOriginToUrlParam,
  leadMatchesIntakeOrigin,
  leadMatchesIntakeOriginTab,
  parseLeadIntakeOrigin,
  parseLeadIntakeOriginFromUrl,
  resolveLeadIntakeOrigin,
  LEAD_INTAKE_ORIGIN_TABS,
} from './leadIntakeOrigin'

describe('parseLeadIntakeOriginFromUrl', () => {
  it('maps short codes; bookmark manual → portal tab', () => {
    expect(parseLeadIntakeOriginFromUrl('campaign')).toBe('campaign_upload')
    expect(parseLeadIntakeOriginFromUrl('manual')).toBe('public_portal')
    expect(parseLeadIntakeOriginFromUrl('portal')).toBe('public_portal')
  })
})

describe('LEAD_INTAKE_ORIGIN_TABS', () => {
  it('has campaign and portal only', () => {
    expect([...LEAD_INTAKE_ORIGIN_TABS]).toEqual(['campaign_upload', 'public_portal'])
  })
})

describe('leadMatchesIntakeOriginTab', () => {
  it('portal tab includes manual and public_portal', () => {
    expect(leadMatchesIntakeOriginTab({ intakeOrigin: 'manual' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({ uploadedBy: 'public_portal' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({ uploadBatchId: 'manual-abc-1' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({}, 'public_portal')).toBe(false)
    expect(leadMatchesIntakeOriginTab({ uploadedBy: 'public_portal' }, 'campaign_upload')).toBe(false)
    expect(leadMatchesIntakeOriginTab({}, 'campaign_upload')).toBe(true)
  })
})
```

Keep existing `parseLeadIntakeOrigin('manual') === 'manual'` (stored field).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/leadIntakeOrigin.test.ts`

Expected: FAIL (`leadMatchesIntakeOriginTab` / `LEAD_INTAKE_ORIGIN_TABS` not exported; URL `manual` still `manual`).

- [ ] **Step 3: Write minimal implementation**

In `src/utils/leadIntakeOrigin.ts`:

```ts
export type LeadIntakeOriginTab = 'campaign_upload' | 'public_portal'

export const LEAD_INTAKE_ORIGIN_TABS: readonly LeadIntakeOriginTab[] = [
  'campaign_upload',
  'public_portal',
] as const
```

URL map: `manual: 'public_portal'` (not `'manual'`).

Hints: `public_portal: 'Form cổng và hồ sơ tạo trong app — tải đủ để thao tác'`.

```ts
export function leadMatchesIntakeOriginTab(
  lead: LeadIntakeOriginResolveInput,
  tab: LeadIntakeOriginTab,
): boolean {
  const resolved = resolveLeadIntakeOrigin(lead)
  if (tab === 'campaign_upload') return resolved === 'campaign_upload'
  return resolved === 'public_portal' || resolved === 'manual'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/leadIntakeOrigin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/leadIntakeOrigin.ts src/utils/leadIntakeOrigin.test.ts
git commit -m "$(cat <<'EOF'
feat(leads): gộp tab tạo tay vào cổng đăng ký (khớp origin).

Bookmark origin=manual mở tab cổng; hồ sơ manual cũ vẫn thuộc nhóm cổng.
EOF
)"
```

---

### Task 2: Firestore `portalIntakeGroup`

**Files:**
- Modify: `src/hooks/useLeads.ts`

**Interfaces:**
- Consumes: none from Task 1 (filter is server-side field names)
- Produces: `LeadListServerFilters.portalIntakeGroup?: boolean` — khi true, constraint `or(where('uploadedBy','==','public_portal'), where('intakeOrigin','in',['manual','public_portal']))`. Không set đồng thời `uploadedByIn` + `intakeOrigin` trên cùng filter object cho tab cổng.

- [ ] **Step 1: Add filter field + constraint**

In `LeadListServerFilters` add:

```ts
  /** Tab Cổng đăng ký: SV cổng ∪ tạo tay (manual) ∪ tạo mới (public_portal). */
  portalIntakeGroup?: boolean
```

In `leadListServerFilterConstraints` (function that already has `if (f.intakeOrigin)` ~line 670), after `uploadedByIn` block:

```ts
  if (f.portalIntakeGroup) {
    c.push(
      or(
        where('uploadedBy', '==', 'public_portal'),
        where('intakeOrigin', 'in', ['manual', 'public_portal']),
      ),
    )
  }
```

`or` already imported from `firebase/firestore`.

Do **not** add `portalIntakeGroup` together with `f.intakeOrigin` / `f.uploadedByIn` from the list UI (Task 3 sets only `portalIntakeGroup`).

If runtime throws `failed-precondition` (index): add composite in `firestore.indexes.json` for `leads` covering `orgId` + this OR — only if the query actually fails; do not add speculative indexes.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --pretty false`

Expected: PASS (or only pre-existing errors unrelated to this field).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLeads.ts
git commit -m "$(cat <<'EOF'
feat(leads): query tab cổng gồm uploadedBy cổng và intakeOrigin manual/portal.

EOF
)"
```

---

### Task 3: Màn Hồ sơ — 2 nút nguồn nhập

**Files:**
- Modify: `src/views/LeadManagement.tsx`

**Interfaces:**
- Consumes: `LEAD_INTAKE_ORIGIN_TABS`, `LeadIntakeOriginTab`, `leadMatchesIntakeOriginTab`, `parseLeadIntakeOriginFromUrl`, `portalIntakeGroup`
- Keeps: `leadMatchesIntakeOrigin(l, 'campaign_upload')` cho oversample trang chiến dịch

- [ ] **Step 1: Wire tab type + server filter + client match**

Imports: replace `LEAD_INTAKE_ORIGINS` / `leadMatchesIntakeOrigin` (keep campaign exact) with:

```ts
import {
  LEAD_INTAKE_ORIGIN_TABS,
  leadIntakeOriginHint,
  leadIntakeOriginLabel,
  leadIntakeOriginToUrlParam,
  leadMatchesIntakeOrigin,
  leadMatchesIntakeOriginTab,
  parseLeadIntakeOriginFromUrl,
  type LeadIntakeOriginTab,
} from '../utils/leadIntakeOrigin'
```

Remove `LeadIntakeOrigin` from `../types` import if unused.

State:

```ts
const [intakeOriginTab, setIntakeOriginTab] = useState<LeadIntakeOriginTab>('campaign_upload')
```

`applyIntakeOriginTab` argument: `LeadIntakeOriginTab`.

```ts
const intakeOriginNeedsScope = intakeOriginTab === 'public_portal'
```

In `leadServerFilters`:

```ts
if (intakeOriginTab === 'public_portal') o.portalIntakeGroup = true
```

Delete the blocks that set `uploadedByIn` / `intakeOrigin` for portal/manual.

Replace every `leadMatchesIntakeOrigin(l, intakeOriginTab)` with `leadMatchesIntakeOriginTab(l, intakeOriginTab)` (keepMatch, sortedFiltered, originScopedLeads, etc.).

Keep:

```ts
(l: Lead) => leadMatchesIntakeOrigin(l, 'campaign_upload')
```

- [ ] **Step 2: Toolbar + empty copy**

Tablist: map `LEAD_INTAKE_ORIGIN_TABS`. Tones: `campaign_upload` slate (như cũ); `public_portal` sky (như cổng cũ). Xóa nhánh emerald `manual`.

Empty `<td>`:

```tsx
{intakeOriginTab === 'public_portal'
  ? 'Chưa có hồ sơ cổng đăng ký trong phạm vi này.'
  : 'Không có hồ sơ khớp bộ lọc.'}
```

Hint under empty portal:

```tsx
{intakeOriginTab === 'public_portal' ? (
  <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
    Bấm «Tạo mới» để thêm hồ sơ, hoặc chờ sinh viên gửi form cổng. Data Excel nằm ở «Tải lên / chiến dịch».
  </p>
) : ...}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --pretty false`

Expected: no error in LeadManagement about `manual` tab.

- [ ] **Step 4: Commit**

```bash
git add src/views/LeadManagement.tsx
git commit -m "$(cat <<'EOF'
feat(leads): hai nút nguồn nhập — chiến dịch và cổng đăng ký.

EOF
)"
```

---

### Task 4: Validation Tạo mới + ghi origin cổng

**Files:**
- Modify: `src/utils/manualLeadCreate.ts`
- Create: `src/utils/manualLeadCreate.test.ts`

**Interfaces:**
- Consumes: `isValidPublicDob`, `isValidPublicPhone`, `isValidPublicNationalId` from `publicRegistrationForm.ts`
- Produces: `validateManualLeadDraft` cùng bộ bắt buộc spec §5; `manualLeadCreatedOriginFields()` → `{ intakeOrigin: 'public_portal', registrationChannel: 'public_portal' }`; `createManualLead` spreads those fields (không đổi `uploadedBy`)

- [ ] **Step 1: Write the failing test**

Create `src/utils/manualLeadCreate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { emptyLeadCoreDraft, type LeadCoreDraft } from './leadProfileEdit'
import {
  manualLeadCreatedOriginFields,
  validateManualLeadDraft,
} from './manualLeadCreate'

function validDraft(over: Partial<LeadCoreDraft> = {}): LeadCoreDraft {
  return {
    ...emptyLeadCoreDraft(),
    fullName: 'Nguyen Van A',
    dateOfBirth: '01/01/2005',
    gender: 'Nam',
    placeOfBirth: 'Ha Noi',
    ethnicity: 'Kinh',
    nationalId: '001234567890',
    phone: '0982856648',
    studentEmail: 'a@example.com',
    permanentAddress: '168 Trinh Van Bo',
    motherPhone: '0912345678',
    highSchool: 'THPT A',
    province: 'Ha Noi',
    applicantCategory: 'Học sinh lớp 12',
    studyIntention: 'Cao đẳng chính quy',
    educationLevel: 'Cao đẳng chính quy',
    majorInterest: 'CNTT',
    academicPerformance: 'Khá',
    source1: 'Web đăng ký',
    ...over,
  }
}

describe('validateManualLeadDraft', () => {
  it('rejects empty / incomplete like portal', () => {
    expect(validateManualLeadDraft(emptyLeadCoreDraft())).toMatch(/họ tên|họ và tên/i)
    expect(validateManualLeadDraft(validDraft({ studentEmail: '' }))).toMatch(/email/i)
    expect(validateManualLeadDraft(validDraft({ motherPhone: '' }))).toMatch(/mẹ/i)
    expect(validateManualLeadDraft(validDraft({ gender: 'Khác' }))).toMatch(/giới tính/i)
    expect(validateManualLeadDraft(validDraft({ academicPerformance: '' }))).toMatch(/học lực/i)
  })

  it('accepts a full valid draft', () => {
    expect(validateManualLeadDraft(validDraft())).toBeNull()
  })

  it('allows missing father phone; rejects invalid father phone', () => {
    expect(validateManualLeadDraft(validDraft({ fatherPhone: '' }))).toBeNull()
    expect(validateManualLeadDraft(validDraft({ fatherPhone: '123' }))).toMatch(/cha/i)
  })
})

describe('manualLeadCreatedOriginFields', () => {
  it('writes public_portal origin', () => {
    expect(manualLeadCreatedOriginFields()).toEqual({
      intakeOrigin: 'public_portal',
      registrationChannel: 'public_portal',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/manualLeadCreate.test.ts`

Expected: FAIL (export missing / old validation only requires source1 + name-or-phone).

- [ ] **Step 3: Write minimal implementation**

In `src/utils/manualLeadCreate.ts`:

```ts
import {
  isValidPublicDob,
  isValidPublicNationalId,
  isValidPublicPhone,
} from './publicRegistrationForm'

export function manualLeadCreatedOriginFields(): {
  intakeOrigin: 'public_portal'
  registrationChannel: 'public_portal'
} {
  return { intakeOrigin: 'public_portal', registrationChannel: 'public_portal' }
}

export function validateManualLeadDraft(draft: LeadCoreDraft): string | null {
  if (!norm(draft.fullName)) return 'Vui lòng nhập họ và tên.'
  if (!isValidPublicDob(draft.dateOfBirth)) {
    return 'Ngày sinh cần đúng DD/MM/YYYY và tuổi hợp lý (12–70).'
  }
  const gender = norm(draft.gender)
  if (gender !== 'Nam' && gender !== 'Nữ') return 'Vui lòng chọn giới tính Nam hoặc Nữ.'
  if (!norm(draft.placeOfBirth)) return 'Vui lòng nhập nơi sinh.'
  if (!norm(draft.ethnicity)) return 'Vui lòng nhập dân tộc.'
  if (!isValidPublicNationalId(draft.nationalId, draft.nationalIdNotAvailable)) {
    return 'CCCD/CMND: 9, 10 hoặc 12 số; hộ chiếu 7–15 ký tự chữ và số (hoặc tick «Chưa có CCCD»).'
  }
  if (!isValidPublicPhone(draft.phone)) {
    return 'SĐT Việt Nam 10 số (bắt đầu 0) hoặc quốc tế bắt đầu bằng +.'
  }
  const email = norm(draft.studentEmail)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ.'
  if (!norm(draft.permanentAddress) && !norm(draft.address)) {
    return 'Vui lòng nhập địa chỉ thường trú.'
  }
  if (!isValidPublicPhone(draft.motherPhone)) {
    return 'SĐT mẹ bắt buộc (10 số VN hoặc + quốc tế).'
  }
  if (norm(draft.fatherPhone) && !isValidPublicPhone(draft.fatherPhone)) {
    return 'SĐT cha không hợp lệ.'
  }
  if (!norm(draft.highSchool)) return 'Vui lòng nhập trường đã theo học.'
  if (!norm(draft.province)) return 'Vui lòng nhập tỉnh/thành.'
  if (!norm(draft.applicantCategory)) return 'Vui lòng chọn đối tượng dự tuyển.'
  if (!norm(draft.studyIntention) && !norm(draft.educationLevel)) {
    return 'Vui lòng chọn hệ đào tạo.'
  }
  if (!norm(draft.majorInterest)) return 'Vui lòng chọn ngành học.'
  if (!norm(draft.academicPerformance)) return 'Vui lòng chọn học lực.'
  if (!norm(draft.source1) && !norm(draft.source)) {
    return 'Cần nguồn tiếp nhận (Nguồn 1) trước khi lưu hồ sơ mới.'
  }
  return null
}
```

In `createManualLead` `setDoc` payload, replace `intakeOrigin: 'manual'` with:

```ts
...manualLeadCreatedOriginFields(),
```

Do not change `ownership.uploadedBy` (UID nhân viên).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/manualLeadCreate.test.ts src/utils/leadIntakeOrigin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/manualLeadCreate.ts src/utils/manualLeadCreate.test.ts
git commit -m "$(cat <<'EOF'
feat(leads): tạo mới bắt buộc đủ mục cổng và ghi intakeOrigin public_portal.

EOF
)"
```

---

### Task 5: Form Tạo mới — giới tính + Nguồn 1 mặc định

**Files:**
- Modify: `src/components/LeadProfileCoreForm.tsx` (field Giới tính ~627–635)
- Modify: `src/components/CreateLeadModal.tsx`

**Interfaces:**
- Consumes: `isNewLead`; `defaultPublicRegistrationConfig().defaultSource1` (`Web đăng ký`); doc `scoringAux/publicRegistrationConfig`
- Produces: select Nam/Nữ khi tạo mới; `source1` điền sẵn khi mở modal

- [ ] **Step 1: Gender select when `isNewLead`**

Replace the Giới tính `<input>` with:

```tsx
<Field label="Giới tính">
  {isNewLead ? (
    <select
      className={INPUT_CLS}
      value={draft.gender}
      disabled={disabled}
      onChange={(e) => patch('gender', e.target.value)}
    >
      <option value="">— Chọn —</option>
      <option value="Nam">Nam</option>
      <option value="Nữ">Nữ</option>
    </select>
  ) : (
    <input
      className={INPUT_CLS}
      value={draft.gender}
      disabled={disabled}
      placeholder="Nam / Nữ / …"
      onChange={(e) => patch('gender', e.target.value)}
    />
  )}
</Field>
```

- [ ] **Step 2: Default source1 from portal config**

In `CreateLeadModal.tsx` import `SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID`, `defaultPublicRegistrationConfig`.

In the `useEffect` that runs when `open` (already resets `emptyLeadCoreDraft`): after reset, if `db`:

```ts
void getDoc(doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID)).then((snap) => {
  const raw = snap.exists()
    ? String((snap.data() as { defaultSource1?: unknown }).defaultSource1 ?? '').trim()
    : ''
  const source1 = raw || defaultPublicRegistrationConfig().defaultSource1
  setDraft((d) => (d.source1.trim() ? d : { ...d, source1, source: d.source || source1 }))
})
```

`getDoc`/`doc` already imported in this file.

Update subtitle if needed: «Điền đủ thông tin như form cổng đăng ký; tab Tài chính nếu thu tiền ngay.»

- [ ] **Step 3: Typecheck + unit tests**

Run:

```
npx vitest run src/utils/manualLeadCreate.test.ts src/utils/leadIntakeOrigin.test.ts
npx tsc -b --pretty false
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/LeadProfileCoreForm.tsx src/components/CreateLeadModal.tsx
git commit -m "$(cat <<'EOF'
feat(leads): tạo mới chọn giới tính Nam/Nữ và mặc định nguồn cổng.

EOF
)"
```

---

### Task 6: Spec status + regression

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-intake-portal-merge-design.md` — Status: `approved / implemented`
- Modify: `docs/superpowers/specs/2026-08-14-intake-origin-tabs-design.md` — thêm dòng: UI 3 tab superseded bởi merge spec; field `manual` vẫn còn trên doc cũ.

- [ ] **Step 1: Update spec headers** as above (no TBD).

- [ ] **Step 2: Full related tests**

Run: `npx vitest run src/utils/leadIntakeOrigin.test.ts src/utils/manualLeadCreate.test.ts src/utils/publicRegistrationForm.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-14-intake-portal-merge-design.md docs/superpowers/specs/2026-08-14-intake-origin-tabs-design.md
git commit -m "$(cat <<'EOF'
docs: chốt spec gộp nguồn nhập cổng đăng ký.

EOF
)"
```

---

## Spec coverage (self-review)

| Spec | Task |
|------|------|
| 2 nút chiến dịch / cổng | 1, 3 |
| Nhóm cổng = manual ∪ public_portal, không backfill | 1, 3 |
| URL `manual` → tab portal | 1 |
| Query `or(uploadedBy, intakeOrigin in …)` | 2, 3 |
| Tạo mới `intakeOrigin`/`registrationChannel` public_portal, `uploadedBy` UID | 4 |
| Nguồn 1 mặc định config cổng | 5 |
| Bắt buộc bộ form SV | 4 |
| Giới tính Nam/Nữ khi tạo mới | 5 |
| Học lực giữ xếp loại, bắt buộc | 4 |
| Cột TVV không đổi | (không đụng) |
| Empty state một câu | 3 |
| Out of scope backfill / form `/dang-ky` / GPA presets | không làm |
