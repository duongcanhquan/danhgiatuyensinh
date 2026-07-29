# Deploy multi-tenant (Phase 0–4)

Thứ tự bắt buộc — **không** deploy Rules trước khi claims đã sync.

## 1. Build Functions

```bash
npm run functions:build
```

## 2. Deploy claim sync Functions

```bash
npx firebase-tools deploy --only functions:syncAuthClaimsOnUserWrite,functions:refreshOwnAuthClaims --project tvts-8f713
```

Cần đăng nhập Firebase CLI (`firebase login`) hoặc `FIREBASE_TOKEN`.

## 3. Backfill orgId (nếu chưa)

```bash
APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run migrate:phase0-orgId
```

## 4. Sync Auth custom claims

```bash
APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run migrate:sync-auth-claims
```

## 5. Indexes + Rules

```bash
npm run deploy:firestore-indexes
npm run deploy:firestore-rules
```

## 6. Hosting (GitHub Pages)

Push/merge vào `main` → workflow `Deploy GitHub Pages`.  
Hoặc Firebase Hosting (nếu dùng): `firebase deploy --only hosting --project tvts-8f713` sau `npm run build`.

## Rollback Rules (DEV mở)

Tạm trỏ `firebase.json` → `firestore.rules.dev.example` rồi `npm run deploy:firestore-rules`.
