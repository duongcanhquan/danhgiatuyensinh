# Phase 4 — Auth Claims + Production Firestore Rules

> **For agentic workers:** Use executing-plans / TDD. Checkbox steps.

**Goal:** Sync Firebase Auth custom claims (`role`, `orgId`, `platform`) from `users/{uid}` and ship multi-tenant Firestore Rules so school users cannot cross orgs; platform superadmin bypasses org match.

**Architecture:** Pure `buildAuthCustomClaims` / `authClaimsNeedUpdate` (tested in app; mirrored in functions). Cloud Function `onDocumentWritten` on `users/{uid}` (database `warmlist`) sets claims. Backfill script for existing users. Client refreshes ID token when claims lag. Production `firestore.rules`; keep catch-all as `firestore.rules.dev.example`.

**Tech Stack:** Firebase Auth Admin, Functions v2 Firestore triggers, Firestore Rules, Vitest.

## Global Constraints

- Deploy order for humans: (1) deploy functions + run claims sync script, (2) deploy rules — never rules-first or everyone locks out.
- Default org `vietmy`; platform = `role == super_admin` → `platform: true`, `orgId` empty.
- Vietnamese comments in ops docs; Rules stay technical.
- `npm test` + app `tsc`/`build` + `functions` `tsc` green.

---

## Task 1: Pure claim helpers (TDD)

**Files:** `src/tenancy/authClaims.ts`, `authClaims.test.ts`; mirror `functions/src/authClaims.ts`

- [x] buildAuthCustomClaims
- [x] authClaimsNeedUpdate
- [x] `npm test`

## Task 2: Sync on user write + script

**Files:** `functions/src/syncAuthClaims.ts`, export in `index.ts`; `scripts/sync-auth-claims.mjs`; npm script; update `create-super-admin.mjs` to set claims

- [x] onDocumentWritten users/{uid}
- [x] Optional callable refreshOwnAuthClaims
- [x] Script APPLY=1 backfill
- [x] functions build

## Task 3: Production Rules

**Files:** `firestore.rules` (new), `firestore.rules.dev.example` (move catch-all), update `firebase.json`, notes in old example path

- [x] Helpers: isPlatform, sameOrg, orgActive
- [x] Match organizations, orgSettings, platformAuditLogs, leads, users, scoringAux (+ default deny or scoped others)
- [x] Legacy docs without orgId readable only if token.orgId == vietmy (transition)

## Task 4: Client token refresh

**Files:** AuthProvider after profile sync

- [x] Compare token vs profile; `getIdToken(true)` when stale
- [x] App tests/build green

## Task 5: Verify + PR

- [x] Commit / push / update PR #4

## Human deploy checklist

1. `npm run functions:build && firebase deploy --only functions:syncAuthClaimsOnUserWrite,functions:refreshOwnAuthClaims`
2. `APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run migrate:sync-auth-claims`
3. (Recommended) `APPLY=1 … npm run migrate:phase0-orgId` if not done
4. `npm run deploy:firestore-indexes`
5. `npm run deploy:firestore-rules`
6. Ask users to sign out/in once (or wait for client `getIdToken(true)`)
