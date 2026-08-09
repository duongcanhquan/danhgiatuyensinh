import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { CallSessionConfigProvider } from './contexts/CallSessionConfigContext'
import { OmicallProvider } from './contexts/OmicallProvider'
import { OmicallAutoBootstrap } from './components/OmicallAutoBootstrap'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginView } from './views/LoginView'
import { AccountantProtectedRoute } from './components/accountant/AccountantProtectedRoute'

const SummaryHubView = lazy(() =>
  import('./views/SummaryHubView').then((m) => ({ default: m.SummaryHubView })),
)
const LeadsWorkspace = lazy(() =>
  import('./views/LeadsWorkspace').then((m) => ({ default: m.LeadsWorkspace })),
)
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView })),
)
const UserManualView = lazy(() =>
  import('./views/UserManualView').then((m) => ({ default: m.UserManualView })),
)
const AnalyticsAdvancedView = lazy(() =>
  import('./views/AnalyticsAdvancedView').then((m) => ({ default: m.AnalyticsAdvancedView })),
)
const AccountantView = lazy(() =>
  import('./views/AccountantView').then((m) => ({ default: m.AccountantView })),
)
const AccountantLoginView = lazy(() =>
  import('./views/accountant/AccountantLoginView').then((m) => ({ default: m.AccountantLoginView })),
)
const AccountantStaffView = lazy(() =>
  import('./views/accountant/AccountantStaffView').then((m) => ({ default: m.AccountantStaffView })),
)
const AccountantReportsView = lazy(() =>
  import('./views/accountant/AccountantReportsView').then((m) => ({
    default: m.AccountantReportsView,
  })),
)
const AccountantLayout = lazy(() =>
  import('./components/accountant/AccountantLayout').then((m) => ({ default: m.AccountantLayout })),
)
const MyDayView = lazy(() => import('./views/MyDayView').then((m) => ({ default: m.MyDayView })))
const OrganizationsView = lazy(() =>
  import('./views/OrganizationsView').then((m) => ({ default: m.OrganizationsView })),
)
const StudentRegistrationView = lazy(() =>
  import('./views/student/StudentRegistrationView').then((m) => ({
    default: m.StudentRegistrationView,
  })),
)
const StudentRegistrationSuccessView = lazy(() =>
  import('./views/student/StudentRegistrationSuccessView').then((m) => ({
    default: m.StudentRegistrationSuccessView,
  })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-slate-600">
      Đang tải màn hình…
    </div>
  )
}

/** VietMy — định tuyến, xác thực và RBAC; `base` cho GitHub Pages. */
export default function App() {
  const rawBase = import.meta.env.BASE_URL
  const basename = rawBase.endsWith('/') && rawBase.length > 1 ? rawBase.slice(0, -1) : rawBase || '/'

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          {/* CallSession ở App: panel cuộc gọi OMICall render ngoài Layout */}
          <CallSessionConfigProvider>
            <OmicallProvider>
              <OmicallAutoBootstrap />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/ke-toan/login" element={<AccountantLoginView />} />
                  <Route path="/dang-ky" element={<Navigate to="/dang-ky/vietmy" replace />} />
                  <Route path="/dang-ky/thanh-cong" element={<StudentRegistrationSuccessView />} />
                  <Route path="/dang-ky/:orgSlug" element={<StudentRegistrationView />} />
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
                      <Route
                        path="import"
                        element={<Navigate to="/settings?tab=data&sub=intake" replace />}
                      />
                      <Route path="analytics" element={<AnalyticsAdvancedView />} />
                      <Route path="kpi" element={<Navigate to="/?tab=kpi-nhan-su" replace />} />
                      <Route path="command" element={<Navigate to="/?tab=van-hanh" replace />} />
                      <Route path="my-day" element={<MyDayView />} />
                      <Route path="organizations" element={<OrganizationsView />} />
                      <Route path="scorecard" element={<Navigate to="/?tab=bang-diem" replace />} />
                      <Route path="call-history" element={<Navigate to="/?tab=lich-goi" replace />} />
                      <Route
                        path="ai"
                        element={<Navigate to="/settings?tab=connect&sub=llm" replace />}
                      />
                      <Route
                        path="staff"
                        element={<Navigate to="/settings?tab=people&sub=staff" replace />}
                      />
                      <Route path="accountant" element={<Navigate to="/ke-toan" replace />} />
                      <Route path="settings" element={<SettingsView />} />
                      <Route path="huong-dan" element={<UserManualView />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </OmicallProvider>
          </CallSessionConfigProvider>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
