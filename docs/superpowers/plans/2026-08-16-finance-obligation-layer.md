# Finance obligation layer — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Compute term-1 tuition due (catalog − scholarship term-1), drive CỌC vs ĐÃ HOÀN THIỆN, hide handover leads from default queues.

**Architecture:** New obligation engine + org tuition catalog; extend scholarship terms; wire enrollment status, accountant/TVV filters, admin UI, card summary.

**Tech Stack:** React, Firestore, Vitest, existing finance utils.

## Global Constraints

- Plain Vietnamese UI copy (vietmy-ui-plain-language).
- Do not rename payment slots or break Sheet import in v1.
- No commit unless user asks.

---

### Task 1: Obligation engine + tuition catalog types/IO

**Files:**
- Create: `src/utils/financeObligation.ts`, `src/utils/financeObligation.test.ts`
- Create: `src/utils/financeTuitionCatalog.ts` (load/save/cache like thresholds)
- Modify: `src/types.ts` — ScholarshipRecord term fields

**Produces:** `computeFinanceObligation()`, `resolveTuitionTerm1Vnd()`, scholarship term-1 credit helpers.

- [ ] TDD engine + catalog parse/save
- [ ] Extend ScholarshipRecord

### Task 2: Enrollment status uses due term-1

**Files:**
- Modify: `src/utils/financeEnrollmentStatus.ts` (+ tests)
- Modify: CF `functions/src/accountantFinanceApi.ts` if it duplicates rules

- [ ] CỌC when ≥ deposit and &lt; dueTerm1
- [ ] ĐÃ HOÀN THIỆN when ≥ dueTerm1 + profile complete
- [ ] No tuition row → cannot reach ĐÃ HOÀN THIỆN via money alone

### Task 3: Queues & list hide

**Files:**
- Modify: `src/utils/accountantFinanceFilter.ts` (+ tests)
- Modify: `src/utils/leadListEnrollment.ts` / LeadManagement default hide

- [ ] Incomplete = approved &lt; dueTerm1 (when due known)
- [ ] Hide ĐÃ HOÀN THIỆN + ENROLLED from default track

### Task 4: Admin UI

**Files:**
- Create: `src/components/FinanceTuitionCatalogPanel.tsx`
- Modify: `ScholarshipSettingsTab.tsx` — n kỳ + allocations + chia đều
- Modify: Settings wiring

### Task 5: Display + Excel

**Files:**
- Accountant card / lead finance summary
- Export columns for obligation

---
