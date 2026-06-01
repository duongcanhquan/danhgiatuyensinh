import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { CallSessionConfigProvider } from './contexts/CallSessionConfigContext'
import { OmicallProvider } from './contexts/OmicallProvider'
import { OmicallAutoBootstrap } from './components/OmicallAutoBootstrap'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SummaryHubView } from './views/SummaryHubView'
import { LeadsWorkspace } from './views/LeadsWorkspace'
import { LoginView } from './views/LoginView'
import { SettingsView } from './views/SettingsView'
import { UserManualView } from './views/UserManualView'
import { AnalyticsAdvancedView } from './views/AnalyticsAdvancedView'
import { AccountantView } from './views/AccountantView'
import { AccountantLoginView } from './views/accountant/AccountantLoginView'
import { AccountantStaffView } from './views/accountant/AccountantStaffView'
import { AccountantReportsView } from './views/accountant/AccountantReportsView'
import { AccountantLayout } from './components/accountant/AccountantLayout'
import { AccountantProtectedRoute } from './components/accountant/AccountantProtectedRoute'
import { MyDayView } from './views/MyDayView'

/** VietMy — định tuyến, xác thực và RBAC; `base` cho GitHub Pages. */
export default function App() {
  const rawBase = import.meta.env.BASE_URL
  const basename = rawBase.endsWith('/') && rawBase.length > 1 ? rawBase.slice(0, -1) : rawBase || '/'

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <CallSessionConfigProvider>
          <OmicallProvider>
          <OmicallAutoBootstrap />
          <Routes>
            <Route path="/ke-toan/login" element={<AccountantLoginView />} />
            <Route element={<AccountantProtectedRoute />}>
              <Route path="/ke-toan" element={<AccountantLayout />}>
                <Route index element={<AccountantView portalMode />} />
                <Route path="nhan-su" element={<AccountantStaffView />} />
                <Route path="bao-cao" element={<AccountantReportsView />} />
              </Route>
            </Route>
            <Route path="/login" element={<LoginView />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<SummaryHubView />} />
                <Route path="leads" element={<LeadsWorkspace />} />
                <Route path="counselor" element={<Navigate to="/leads" replace />} />
                <Route path="import" element={<Navigate to="/settings?tab=data&sub=intake" replace />} />
                <Route path="analytics" element={<AnalyticsAdvancedView />} />
                <Route path="kpi" element={<Navigate to="/?tab=kpi-nhan-su" replace />} />
                <Route path="command" element={<Navigate to="/?tab=van-hanh" replace />} />
                <Route path="my-day" element={<MyDayView />} />
                <Route path="scorecard" element={<Navigate to="/?tab=bang-diem" replace />} />
                <Route path="call-history" element={<Navigate to="/?tab=lich-goi" replace />} />
                <Route path="ai" element={<Navigate to="/settings?tab=connect&sub=llm" replace />} />
                <Route path="staff" element={<Navigate to="/settings?tab=people&sub=staff" replace />} />
                <Route path="accountant" element={<Navigate to="/ke-toan" replace />} />
                <Route path="settings" element={<SettingsView />} />
                <Route path="huong-dan" element={<UserManualView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          </OmicallProvider>
          </CallSessionConfigProvider>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
