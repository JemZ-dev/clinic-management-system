import { BrowserRouter, Link, Route, Routes } from 'react-router'
import AuthProvider from '../context/AuthProvider.jsx'
import ProtectedRoute, { AuthReady } from './ProtectedRoute.jsx'
import AppLayout from '../layouts/AppLayout.jsx'
import AuthLayout from '../layouts/AuthLayout.jsx'
import AuthPage from '../features/auth/pages/AuthPage.jsx'
import WorkspacePage from '../features/dashboard/pages/WorkspacePage.jsx'
import ProfilePage from '../features/profile/pages/ProfilePage.jsx'

export default function App() {
  return <BrowserRouter><AuthProvider><AuthReady><Routes>
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" registration />} />
    </Route>
    <Route element={<ProtectedRoute />}><Route element={<AppLayout />}>
      <Route index element={<WorkspacePage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Route></Route>
    <Route path="*" element={<main className="async-state"><h1>Page not found</h1><p>The page may have moved or the address may be incorrect.</p><Link to="/">Return to workspace</Link></main>} />
  </Routes></AuthReady></AuthProvider></BrowserRouter>
}
