export default function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="card auth-card">
        <h1>💰 Finanzas</h1>
        <p>Falta conectar la base de datos.</p>
        <p className="muted">
          Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (en el
          archivo <code>.env</code> para desarrollo local, o como variables del repositorio en
          GitHub para la página publicada).
        </p>
      </div>
    </div>
  )
}
