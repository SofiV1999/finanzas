import AccountsManager from '../components/AccountsManager'

export default function Ahorros() {
  return (
    <>
      <h1>🏦 Ahorros y metas</h1>
      <p className="muted">Cuentas, inversiones y metas financieras.</p>
      <div className="stack">
        <AccountsManager mode="activos" />
        <div className="card placeholder">
          <strong>Próximamente</strong>
          <ul>
            <li>Metas con monto y fecha (inversión, fondo de emergencia, reserva para impuestos)</li>
            <li>Avance de cada meta según el saldo de su cuenta</li>
          </ul>
        </div>
      </div>
    </>
  )
}
