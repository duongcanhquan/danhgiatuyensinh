import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '../contexts/authContextDefinition'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng bên trong AuthProvider')
  return ctx
}
