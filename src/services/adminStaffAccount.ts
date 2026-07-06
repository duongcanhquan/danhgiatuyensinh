import { getFunctions, httpsCallable } from 'firebase/functions'
import { callableErrorMessage } from '../utils/callableErrorMessage'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type StaffAccountAction = 'disable_login' | 'enable_login' | 'delete' | 'set_password'

export type AdminStaffAccountResult = {
  ok: boolean
  action: StaffAccountAction
  targetUserId: string
}

export async function adminStaffAccountAction(
  targetUserId: string,
  action: StaffAccountAction,
  opts?: { accountantPortalOnly?: boolean; newPassword?: string },
): Promise<AdminStaffAccountResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<
    {
      targetUserId: string
      action: StaffAccountAction
      accountantPortalOnly?: boolean
      newPassword?: string
    },
    AdminStaffAccountResult
  >(getFunctions(app, 'asia-southeast1'), 'adminStaffAccountAction')
  try {
    const res = await fn({
      targetUserId,
      action,
      accountantPortalOnly: opts?.accountantPortalOnly,
      ...(opts?.newPassword ? { newPassword: opts.newPassword } : {}),
    })
    return res.data
  } catch (e) {
    throw new Error(
      callableErrorMessage(e, 'Không thực hiện được thao tác nhân sự — thử đăng nhập lại hoặc liên hệ quản trị deploy Functions.'),
    )
  }
}
