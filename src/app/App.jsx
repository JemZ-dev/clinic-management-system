import { lazy } from 'react'
import { createBrowserRouter, createRoutesFromElements, Link, Outlet, Route, RouterProvider } from 'react-router'
import AuthProvider from '../context/AuthProvider.jsx'
import ProtectedRoute, { AuthReady } from './ProtectedRoute.jsx'
import AppLayout from '../layouts/AppLayout.jsx'
import AuthLayout from '../layouts/AuthLayout.jsx'
import AuthPage from '../features/auth/pages/AuthPage.jsx'
import WorkspacePage from '../features/dashboard/pages/WorkspacePage.jsx'
import ProfilePage from '../features/profile/pages/ProfilePage.jsx'
import RecordListPage from '../components/records/RecordListPage.jsx'
import RecordDetailPage from '../components/records/RecordDetailPage.jsx'
import RecordFormPage from '../components/records/RecordFormPage.jsx'
import { patientsConfig } from '../features/patients/patients.config.js'
import { doctorsConfig } from '../features/doctors/doctors.config.js'
import AsyncState from '../components/ui/AsyncState.jsx'
import AppointmentsPage from '../features/appointments/pages/AppointmentsPage.jsx'
import AppointmentDetailsPage from '../features/appointments/pages/AppointmentDetailsPage.jsx'

const AppointmentFormPage = lazy(() => import('../features/appointments/pages/AppointmentFormPage.jsx'))
const VisitsPage = lazy(() => import('../features/visits/pages/VisitsPage.jsx'))
const VisitFormPage = lazy(() => import('../features/visits/pages/VisitFormPage.jsx'))
const VisitDetailsPage = lazy(() => import('../features/visits/pages/VisitDetailsPage.jsx'))

function Root() { return <AuthProvider><AuthReady><Outlet /></AuthReady></AuthProvider> }

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<Root />} errorElement={<AsyncState title="Unable to open this page" message="Something went wrong while opening the clinic workspace. Reload the page to try again." onRetry={() => window.location.reload()} />}>
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" registration />} />
    </Route>
    <Route element={<ProtectedRoute />}><Route element={<AppLayout />}>
      <Route index element={<WorkspacePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="visits">
        <Route index element={<VisitsPage />} />
        <Route path="new" element={<VisitFormPage />} />
        <Route path=":id" element={<VisitDetailsPage />} />
      </Route>
      <Route path="appointments">
        <Route index element={<AppointmentsPage />} />
        <Route path="new" element={<AppointmentFormPage />} />
        <Route path=":id" element={<AppointmentDetailsPage />} />
        <Route path=":id/edit" element={<AppointmentFormPage editing />} />
      </Route>
      {[patientsConfig, doctorsConfig].map((config) => <Route path={config.kind} key={config.kind}>
        <Route index element={<RecordListPage key={config.kind} config={config} />} />
        <Route path="new" element={<RecordFormPage key={`${config.kind}-new`} config={config} />} />
        <Route path=":id" element={<RecordDetailPage key={config.kind} config={config} />} />
        <Route path=":id/edit" element={<RecordFormPage key={`${config.kind}-edit`} config={config} editing />} />
      </Route>)}
    </Route></Route>
    <Route path="*" element={<main className="async-state"><h1>Page not found</h1><p>The page may have moved or the address may be incorrect.</p><Link to="/">Return to workspace</Link></main>} />
  </Route>
))

export default function App() {
  return <RouterProvider router={router} />
}
