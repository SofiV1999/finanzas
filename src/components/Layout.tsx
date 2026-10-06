import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { sections } from '../sections'
import TransactionForm from './TransactionForm'

function NavLinks({ compact = false }: { compact?: boolean }) {
  return sections.map((s) => (
    <NavLink
      key={s.path}
      to={s.path}
      end={s.path === '/'}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
    >
      <span className="nav-icon">{s.icon}</span>
      {compact ? s.short : s.label}
    </NavLink>
  ))
}

export default function Layout() {
  const { session } = useAuth()
  const [registering, setRegistering] = useState(false)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">💰 Finanzas</div>
        <NavLinks />
        <div className="sidebar-footer">
          <span className="muted">{session?.user.email}</span>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        <NavLinks compact />
      </nav>

      <button className="btn fab" title="Registrar movimiento" onClick={() => setRegistering(true)}>
        + Registrar
      </button>
      {registering && <TransactionForm onClose={() => setRegistering(false)} />}
    </div>
  )
}
