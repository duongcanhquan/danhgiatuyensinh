import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { ManagementViewScopeProvider } from './contexts/ManagementViewScopeContext'
import { CallSessionConfigProvider } from './contexts/CallSessionConfigContext'
import { OmicallProvider } from './contexts/OmicallProvider'
import { OrgProvider } from './contexts/OrgProvider'
import { SharedFirestoreDataProviders } from './contexts/SharedFirestoreDataProviders'
import { InfoScoreRulesProvider } from './contexts/InfoScoreRulesContext'
import { LeadClassificationRulesProvider } from './contexts/LeadClassificationRulesContext'
import { OmicallAutoBootstrap } from './components/OmicallAutoBootstrap'
import { DangkyDomainGate } from './components/DangkyDomainGate'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginView } from './views/LoginView'
import { AccountantProtectedRoute } from './components/accountant/AccountantProtectedRoute'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { useAuth } from './hooks/useAuth'

const SummaryHubView = lazyWithRetry(() =>
  import('./views/SummaryHubView').then((m) => ({ default: m.SummaryHubView })),
)
const LeadsWorkspace = lazyWithRetry(() =>
  import('./views/LeadsWorkspace').then((m) => ({ default: m.LeadsWorkspace })),
)
const SettingsView = lazyWithRetry(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView })),
)
const UserManualView = lazyWithRetry(() =>
  import('./views/UserManualView').then((m) => ({ default: m.UserManualView })),
)
const AnalyticsAdvancedView = lazyWithRetry(() =>
  import('./views/AnalyticsAdvancedView').then((m) => ({ default: m.AnalyticsAdvancedView })),
)
const AdmissionsReportsView = lazyWithRetry(() =>
  import('./views/AdmissionsReportsView').then((m) => ({ default: m.AdmissionsReportsView })),
)
const AccountantView = lazyWithRetry(() =>
  import('./views/AccountantView').then((m) => ({ default: m.AccountantView })),
)
const AccountantLoginView = lazyWithRetry(() =>
  import('./views/accountant/AccountantLoginView').then((m) => ({ default: m.AccountantLoginView })),
)
const AccountantStaffView = lazyWithRetry(() =>
  import('./views/accountant/AccountantStaffView').then((m) => ({ default: m.AccountantStaffView })),
)
const AccountantReportsView = lazyWithRetry(() =>
  import('./views/accountant/AccountantReportsView').then((m) => ({
    default: m.AccountantReportsView,
  })),
)
const AccountantLayout = lazyWithRetry(() =>
  import('./components/accountant/AccountantLayout').then((m) => ({ default: m.AccountantLayout })),
)
const MyDayView = lazyWithRetry(() =>
  import('./views/MyDayView').then((m) => ({ default: m.MyDayView })),
)
const OrganizationsView = lazyWithRetry(() =>
  import('./views/OrganizationsView').then((m) => ({ default: m.OrganizationsView })),
)
const StudentRegistrationView = lazyWithRetry(() =>
  import('./views/student/StudentRegistrationView').then((m) => ({
    default: m.StudentRegistrationView,
  })),
)
const StudentRegistrationSuccessView = lazyWithRetry(() =>
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

/** Mặc định vào Hồ sơ; Marketing → báo cáo. Link cũ `/?tab=…` chuyển sang `/tong-ket`. */
function DefaultHomeRedirect() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  if (profile?.role === 'marketing') {
    return <Navigate to="/bao-cao-tuyen-sinh" replace />
  }
  const tab = searchParams.get('tab')
  if (tab) {
    const q = new URLSearchParams(searchParams)
    return <Navigate to={`/tong-ket?${q.toString()}`} replace />
  }
  return <Navigate to="/leads" replace />
}

/** VietMy — định tuyến, xác thực và RBAC; `base` cho GitHub Pages. */
export default function App() {
  const rawBase = import.meta.env.BASE_URL
  const basename = rawBase.endsWith('/') && rawBase.length > 1 ? rawBase.slice(0, -1) : rawBase || '/'

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ManagementViewScopeProvider>
        {/* Org + danh bạ/master data phải bọc cả OMICall (panel gọi ngoài Layout). */}
        <OrgProvider>
          <SharedFirestoreDataProviders>
            <InfoScoreRulesProvider>
              <LeadClassificationRulesProvider>
                <BrowserRouter basename={basename}>
                  <DangkyDomainGate>
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
                          <Route index element={<DefaultHomeRedirect />} />
                          <Route path="tong-ket" element={<SummaryHubView />} />
                          <Route path="leads" element={<LeadsWorkspace />} />
                          <Route path="counselor" element={<Navigate to="/leads" replace />} />
                          <Route
                            path="import"
                            element={<Navigate to="/settings?tab=data&sub=intake" replace />}
                          />
                          <Route path="analytics" element={<AnalyticsAdvancedView />} />
                          <Route path="bao-cao-tuyen-sinh" element={<AdmissionsReportsView />} />
                          <Route path="kpi" element={<Navigate to="/tong-ket?tab=kpi-nhan-su" replace />} />
                          <Route path="command" element={<Navigate to="/tong-ket?tab=van-hanh" replace />} />
                          <Route path="my-day" element={<MyDayView />} />
                          <Route path="organizations" element={<OrganizationsView />} />
                          <Route path="scorecard" element={<Navigate to="/tong-ket?tab=bang-diem" replace />} />
                          <Route path="call-history" element={<Navigate to="/tong-ket?tab=lich-goi" replace />} />
                          <Route
                            path="ai"
                            element={<Navigate to="/settings?tab=advise&sub=consulting&adviseStep=ai" replace />}
                          />
                          <Route
                            path="staff"
                            element={<Navigate to="/settings?tab=people&sub=staff" replace />}
                          />
                          <Route path="accountant" element={<Navigate to="/ke-toan" replace />} />
                          <Route path="settings" element={<SettingsView />} />
                          <Route path="huong-dan" element={<UserManualView />} />
                          <Route path="*" element={<Navigate to="/leads" replace />} />
                        </Route>
                      </Route>
                    </Routes>
                  </Suspense>
                    </OmicallProvider>
                  </CallSessionConfigProvider>
                  </DangkyDomainGate>
                </BrowserRouter>
              </LeadClassificationRulesProvider>
            </InfoScoreRulesProvider>
          </SharedFirestoreDataProviders>
        </OrgProvider>
        </ManagementViewScopeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
