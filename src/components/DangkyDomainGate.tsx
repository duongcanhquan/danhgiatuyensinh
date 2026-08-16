import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Host cổng đăng ký ngắn — mở thẳng form VietMy, không vào màn đăng nhập CRM. */
export const DANGKY_PUBLIC_HOST = 'dangky.vietmycollege.com'

/**
 * Khi mở domain `dangky.vietmycollege.com`:
 * - `/` hoặc path không phải `/dang-ky…` → chuyển sang `/dang-ky/vietmy`
 * Domain CRM (`ts` / `admission`) không bị ảnh hưởng.
 */
export function DangkyDomainGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hostname !== DANGKY_PUBLIC_HOST) return
    const path = location.pathname || '/'
    if (path === '/' || path === '') {
      navigate('/dang-ky/vietmy', { replace: true })
      return
    }
    if (!path.startsWith('/dang-ky')) {
      navigate('/dang-ky/vietmy', { replace: true })
    }
  }, [location.pathname, navigate])

  return children
}
