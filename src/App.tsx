import type { ReactElement } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import { DataProvider } from './lib/data'
import Ahorros from './pages/Ahorros'
import Configuracion from './pages/Configuracion'
import Deudas from './pages/Deudas'
import Login from './pages/Login'
import Movimientos from './pages/Movimientos'
import Presupuesto from './pages/Presupuesto'
import Reportes from './pages/Reportes'
import Resumen from './pages/Resumen'
import SetupNeeded from './pages/SetupNeeded'
import { sections } from './sections'

const pages: Record<string, ReactElement> = {
  '/': <Resumen />,
  '/movimientos': <Movimientos />,
  '/presupuesto': <Presupuesto />,
  '/deudas': <Deudas />,
  '/ahorros': <Ahorros />,
  '/reportes': <Reportes />,
  '/configuracion': <Configuracion />,
}

export default function App() {
  const { session, loading } = useAuth()

  if (!isSupabaseConfigured) return <SetupNeeded />
  if (loading) return <div className="center-screen muted">Cargando…</div>
  if (!session) return <Login />

  // HashRouter (#/ruta) para que recargar cualquier página funcione en GitHub Pages
  return (
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            {sections.map((s) => (
              <Route key={s.path} path={s.path} element={pages[s.path]} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  )
}
