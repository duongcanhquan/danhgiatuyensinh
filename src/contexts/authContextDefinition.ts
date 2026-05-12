import { createContext } from 'react'
import type { User } from 'firebase/auth'
import type { AuthState, Permission, UserRole } from '../types'

export type AuthContextValue = AuthState & {
  firebaseUser: User | null
  can: (p: Permission) => boolean
  signOut: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  /** Admin: tạo tài khoản Auth + hồ sơ Firestore (dùng app Auth phụ). */
  createStaffAccount: (input: {
    email: string
    password: string
    displayName: string
    role: UserRole
  }) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
