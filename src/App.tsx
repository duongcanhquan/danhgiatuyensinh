import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { OmicallProvider } from './contexts/OmicallProvider'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DataIntake } from './components/DataIntake'
import { DashboardView } from './views/DashboardView'
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
import { CounselorKpiView } from './views/CounselorKpiView'
import { CommandCenterView } from './views/CommandCenterView'
import { MyDayView } from './views/MyDayView'
import { ScorecardView } from './views/ScorecardView'
import { CallHistoryView } from './views/CallHistoryView'

/** VietMy — định tuyến, xác thực và RBAC; `base` cho GitHub Pages. */
export default function App() {
  const rawBase = import.meta.env.BASE_URL
  const basename = rawBase.endsWith('/') && rawBase.length > 1 ? rawBase.slice(0, -1) : rawBase || '/'

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <OmicallProvider>
        <BrowserRouter basename={basename}>
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
                <Route index element={<DashboardView />} />
                <Route path="leads" element={<LeadsWorkspace />} />
                <Route path="counselor" element={<Navigate to="/leads" replace />} />
                <Route path="import" element={<DataIntake />} />
                <Route path="analytics" element={<AnalyticsAdvancedView />} />
                <Route path="kpi" element={<CounselorKpiView />} />
                <Route path="command" element={<CommandCenterView />} />
                <Route path="my-day" element={<MyDayView />} />
                <Route path="scorecard" element={<ScorecardView />} />
                <Route path="call-history" element={<CallHistoryView />} />
                <Route path="ai" element={<Navigate to="/settings?tab=llm" replace />} />
                <Route path="staff" element={<Navigate to="/settings?tab=staff" replace />} />
                <Route path="accountant" element={<Navigate to="/ke-toan" replace />} />
                <Route path="settings" element={<SettingsView />} />
                <Route path="huong-dan" element={<UserManualView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        </OmicallProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
