import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import Login from './pages/Login'
import SectionPage from './pages/SectionPage'
import SetupNeeded from './pages/SetupNeeded'
import { sections } from './sections'

export default function App() {
  const { session, loading } = useAuth()

  if (!isSupabaseConfigured) return <SetupNeeded />
  if (loading) return <div className="center-screen muted">Cargando…</div>
  if (!session) return <Login />

  // HashRouter (#/ruta) para que recargar cualquier página funcione en GitHub Pages
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {sections.map((s) => (
            <Route key={s.path} path={s.path} element={<SectionPage section={s} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
