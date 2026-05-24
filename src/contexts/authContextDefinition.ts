import { createContext } from 'react'
import type { User } from 'firebase/auth'
import type { AuthState, Permission, UserRole } from '../types'

export type AuthContextValue = AuthState & {
  firebaseUser: User | null
  can: (p: Permission) => boolean
  /** Chạy LLM trên lead / AI Miner: cần `ai:use` + cờ nhân sự (Admin / Siêu quản trị luôn được). */
  canRunLlmAnalysis: boolean
  signOut: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  /** Admin: tạo tài khoản Auth + hồ sơ Firestore (dùng app Auth phụ). */
  createStaffAccount: (input: {
    email: string
    password: string
    displayName: string
    role: UserRole
    managedCounselorIds?: string[]
  }) => Promise<void>
  /**
   * Admin: cập nhật `users/{userId}` (tên, vai trò, hoạt động).
   * Không xóa được tài khoản Firebase Auth từ trình duyệt — chỉ vô hiệu hóa trong danh bạ.
   */
  updateStaffProfile: (input: {
    userId: string
    displayName?: string
    role?: UserRole
    isActive?: boolean
    /** Quản lý bật quyền dùng LLM / tác vụ AI trên CRM (Firestore `users`). */
    allowLlmAndAiTasks?: boolean
    managedCounselorIds?: string[]
    omicallSipUser?: string
    omicallSipPassword?: string
    omicallAgentId?: string
    omicallOutboundNumber?: string
  }) => Promise<void>
  /**
   * Admin: gửi email «đặt lại mật khẩu» (Firebase Auth) tới địa chỉ đã đăng ký.
   * Không đặt mật khẩu thủ công được từ client — cần Admin SDK / Cloud Function nếu muốn gán pass trực tiếp.
   */
  sendStaffPasswordResetEmail: (email: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
