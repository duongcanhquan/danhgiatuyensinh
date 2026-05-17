import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DataIntake } from './components/DataIntake'
import { DashboardView } from './views/DashboardView'
import { LeadsWorkspace } from './views/LeadsWorkspace'
import { LoginView } from './views/LoginView'
import { SettingsView } from './views/SettingsView'
import { UserManualView } from './views/UserManualView'
import { AnalyticsAdvancedView } from './views/AnalyticsAdvancedView'

/** VietMy — định tuyến, xác thực và RBAC; `base` cho GitHub Pages. */
export default function App() {
  const rawBase = import.meta.env.BASE_URL
  const basename = rawBase.endsWith('/') && rawBase.length > 1 ? rawBase.slice(0, -1) : rawBase || '/'

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/login" element={<LoginView />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardView />} />
                <Route path="leads" element={<LeadsWorkspace />} />
                <Route path="counselor" element={<Navigate to="/leads" replace />} />
                <Route path="import" element={<DataIntake />} />
                <Route path="analytics" element={<AnalyticsAdvancedView />} />
                <Route path="ai" element={<Navigate to="/settings?tab=llm" replace />} />
                <Route path="staff" element={<Navigate to="/settings?tab=staff" replace />} />
                <Route path="settings" element={<SettingsView />} />
                <Route path="huong-dan" element={<UserManualView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
