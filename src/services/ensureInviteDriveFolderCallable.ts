import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from './firebase'
import { callableErrorMessage } from '../utils/callableErrorMessage'

export type EnsureInviteDriveFolderResult = {
  folderUrl: string
  folderId: string
}

function fns() {
  const app = getFirebaseApp()
  if (!app) return null
  return getFunctions(app, 'asia-southeast1')
}

function isCfMissingOrTransient(e: unknown): boolean {
  const code = String((e as { code?: string })?.code ?? '')
  return (
    code === 'functions/not-found' ||
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded'
  )
}

/**
 * Tạo folder giấy mời qua Cloud Function (gọi Apps Script phía server — không CORS).
 * Trả null khi CF chưa deploy để client fallback trình duyệt.
 */
export async function tryEnsureInviteDriveFolderCallable(input: {
  leadId: string
  rootFolderId: string
}): Promise<EnsureInviteDriveFolderResult | null> {
  const f = fns()
  if (!f) return null
  try {
    const call = httpsCallable<typeof input, EnsureInviteDriveFolderResult>(f, 'ensureInviteDriveFolder')
    const res = await call(input)
    const folderUrl = String(res.data?.folderUrl ?? '').trim()
    const folderId = String(res.data?.folderId ?? '').trim()
    if (!folderUrl && !folderId) return null
    return {
      folderUrl: folderUrl || `https://drive.google.com/drive/folders/${folderId}`,
      folderId,
    }
  } catch (e) {
    if (isCfMissingOrTransient(e)) {
      console.warn('[ensureInviteDriveFolder] CF chưa sẵn — fallback trình duyệt', e)
      return null
    }
    throw new Error(callableErrorMessage(e, 'Không tạo được thư mục giấy mời trên server.'), { cause: e })
  }
}
