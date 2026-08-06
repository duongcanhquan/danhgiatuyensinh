# Bulk classify + call queue signals — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement directly in-session with TDD). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mass set priority tags + denormalized last-call signals with list filters.  
**Architecture:** Pure helpers for call-queue filters; patch writers on call end; BulkLeadActionBar + LeadManagement filters.  
**Tech stack:** React, Firestore, existing BulkLeadActionBar / useLeads filters.

## File map

| File | Role |
|------|------|
| `src/utils/leadCallSignals.ts` | Pure: patch builder, queue filter match, list line |
| `src/utils/leadCallSignals.test.ts` | Tests |
| `src/utils/bulkLeadPriorityTag.ts` | Batch write priorityTag |
| `src/types.ts` | Lead fields `lastCallAt`, `lastCalledByLabel`, `lastCallOutcome` |
| `src/hooks/useLeads.ts` | mapDoc + server filter for call queue |
| `src/services/saveCallSessionInteraction.ts` | Write lastCall* |
| `src/services/logOmicallInteraction.ts` | Write lastCall* |
| `src/components/bulk/BulkLeadActionBar.tsx` | UI gán nhãn |
| `src/views/LeadManagement.tsx` | Wire bulk tag + call filter chips + list subline |

### Task 1: leadCallSignals helpers (TDD)

- [ ] Tests for filter: never_called / called_today / needs_callback
- [ ] Implement helpers + format list line
- [ ] Commit

### Task 2: Types + mapDoc + writers

- [ ] Add Lead fields; map in useLeads
- [ ] Patch from saveCallSession + logOmicall
- [ ] Commit

### Task 3: Bulk priority tag

- [ ] bulkLeadPriorityTag util + bar UI + LeadManagement handler
- [ ] Commit

### Task 4: List filter + display

- [ ] Call queue chip filter; subline under name
- [ ] Server/client filter as appropriate
- [ ] Verify build/tests; commit; push PR
